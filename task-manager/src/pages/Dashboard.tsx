import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    Calendar,
    Settings,
    LogOut,
    Trophy,
    Plus,
    CloudLightning,
    RefreshCw,
    Sparkles,
    BarChart3,
    CheckCircle2,
    Clock,
    Target,
    Shield,
    Bot,
    Bell,
    Palette,
    Zap,
    Globe,
    Cpu,
    User,
    Mail,
    Lock,
    Check,
    ListTodo,
    X
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie
} from 'recharts';
import api from '../services/api';
import TaskCard from '../components/TaskCard';
import SmartAdd from '../components/SmartAdd';

const Dashboard: React.FC = () => {
    const [tasks, setTasks] = useState<any[]>([]);
    const [briefing, setBriefing] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [username, setUsername] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userProfilePic, setUserProfilePic] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'calendar' | 'analytics' | 'settings'>('dashboard');
    const [isUpdating, setIsUpdating] = useState(false);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDesc, setTaskDesc] = useState('');
    const [taskPriority, setTaskPriority] = useState('medium');
    const [taskCategory, setTaskCategory] = useState('General');
    const [taskDueDate, setTaskDueDate] = useState('');
    const [taskDurationDays, setTaskDurationDays] = useState<string>('');

    // System Settings States
    const [aiPersonality, setAiPersonality] = useState('Professional');
    const [autoDecomposition, setAutoDecomposition] = useState(true);
    const [smartPrioritization, setSmartPrioritization] = useState(false);
    const [uiTheme, setUiTheme] = useState('Dark');
    const [desktopNotifications, setDesktopNotifications] = useState(true);
    const [calendarSync, setCalendarSync] = useState(false);
    const [activeNotifications, setActiveNotifications] = useState<{ id: string, message: string }[]>([]);

    // Use a ref so the WebSocket handler always reads the *current* value
    // without needing to recreate the socket on every toggle
    const desktopNotificationsRef = useRef(desktopNotifications);
    useEffect(() => {
        desktopNotificationsRef.current = desktopNotifications;
    }, [desktopNotifications]);

    const tasksRef = useRef(tasks);
    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    // Helper: fire a toast + optional browser notification
    const fireNotification = (message: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        setActiveNotifications(prev => [...prev, { id, message }]);
        setTimeout(() => {
            setActiveNotifications(prev => prev.filter(n => n.id !== id));
        }, 6000);
        if (desktopNotificationsRef.current && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Task Manager', { body: message, icon: '/favicon.ico' });
        }
    };

    // ── Service Worker + Web Push subscription ──────────────────────────────
    // Registers sw.js, asks for permission, subscribes to push, sends
    // subscription to backend so it can fire notifications when the tab is closed.
    useEffect(() => {
        const registerPush = async () => {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                console.warn('Push notifications not supported in this browser.');
                return;
            }

            try {
                // 1. Request notification permission
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    console.info('Notification permission denied.');
                    return;
                }

                // 2. Register the service worker
                const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                await navigator.serviceWorker.ready;

                // 3. Fetch VAPID public key from backend
                const keyRes = await api.get('/push/vapid-public-key');
                const vapidPublicKey: string = keyRes.data.public_key;

                // Convert base64url VAPID key to Uint8Array
                const urlBase64ToUint8 = (b64: string): Uint8Array => {
                    const padding = '='.repeat((4 - b64.length % 4) % 4);
                    const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
                    const raw = window.atob(base64);
                    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
                };

                // 4. Subscribe the browser to Web Push
                const pushSub = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8(vapidPublicKey).buffer as ArrayBuffer,
                });

                // 5. POST subscription to backend for storage
                const subJson = pushSub.toJSON();
                await api.post('/push/subscribe', {
                    endpoint: subJson.endpoint,
                    p256dh: subJson.keys?.p256dh,
                    auth: subJson.keys?.auth,
                });

                console.info('Web Push subscription active — notifications work even when tab is closed.');
            } catch (err) {
                console.warn('Push subscription setup failed:', err);
            }
        };

        registerPush();
    }, []);

    // WebSocket — created ONCE on mount, uses ref to avoid stale closures
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Use the current host so it works on any IP (LAN, localhost, etc.)
        const wsHost = import.meta.env.VITE_API_URL
            ? import.meta.env.VITE_API_URL.replace(/^https?/, 'ws')
            : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
        const socket = new WebSocket(`${wsHost}/ws/${token}`);

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            // Real-time State Updates
            if (data.type === 'TASK_CREATED') {
                setTasks(prev => [data.task, ...prev]);
            } else if (data.type === 'TASK_UPDATED') {
                setTasks(prev => prev.map(t => t.id === data.task.id ? data.task : t));
            } else if (data.type === 'TASK_DELETED') {
                setTasks(prev => prev.filter(t => t.id !== data.task_id));
            }

            // Notifications — reads desktopNotificationsRef so always current
            if (data.message) {
                fireNotification(data.message);
            }
        };

        socket.onerror = () => console.warn('WebSocket error — will retry on next mount');

        return () => socket.close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Two-Tier Reminder System ─────────────────────────────────────────────────
    //
    //  SCENARIO 1 — Meeting / Short task
    //    Fires 5 minutes before due_date for ANY task that has a due time.
    //    e.g. "You have a meeting at 10 PM" → reminder fires at 9:55 PM.
    //
    //  SCENARIO 2 — Multi-day task
    //    If the task was created more than 2 days before its due_date,
    //    fire a separate "2 days left" reminder 48 h before due.
    //    e.g. Task added Feb 1, due Feb 11 (10-day span)
    //         → reminder fires on Feb 9 (2 days before).
    //
    //  Two independent Sets ensure both reminders can fire for the same task.
    // ────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const FIVE_MIN_MS = 5 * 60 * 1000;            // 5 minutes in ms
        const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;  // 48 hours in ms
        const OVERDUE_WIN_MS = 2 * 60 * 1000;             // 2-min grace window

        // Independent tracking — each tier fires separately per task
        const notifiedFiveMin = new Set<number>();
        const notifiedTwoDay = new Set<number>();
        const notifiedOverdue = new Set<number>();

        const checkReminders = () => {
            const now = Date.now();

            tasksRef.current.forEach((task: any) => {
                if (!task.due_date || task.status === 'completed') return;

                const due = new Date(task.due_date).getTime();
                const created = task.created_at ? new Date(task.created_at).getTime() : due;
                const diff = due - now;      // ms remaining (negative = overdue)
                const span = due - created;  // total task lifespan in ms

                // —— SCENARIO 1: 5-minute meeting/task reminder ——————————————
                if (diff > 0 && diff <= FIVE_MIN_MS && !notifiedFiveMin.has(task.id)) {
                    notifiedFiveMin.add(task.id);
                    const mins = Math.max(1, Math.round(diff / 60000));
                    fireNotification(
                        `⏰ Meeting Reminder: "${task.title}" starts in ${mins} minute${mins !== 1 ? 's' : ''}! Get ready.`
                    );
                }

                // —— SCENARIO 2: 2-day early warning for multi-day tasks ——————
                // Only triggers when total task span is more than 2 days
                if (
                    span > TWO_DAYS_MS &&         // task was planned for > 2 days
                    diff > 0 &&                   // not yet overdue
                    diff <= TWO_DAYS_MS &&         // 2 days or less remaining
                    !notifiedTwoDay.has(task.id)
                ) {
                    notifiedTwoDay.add(task.id);
                    const hoursLeft = Math.round(diff / (60 * 60 * 1000));
                    const label = hoursLeft >= 36 ? '2 days' : hoursLeft >= 12 ? `${Math.round(hoursLeft / 24)} day` : `${hoursLeft} hours`;
                    fireNotification(
                        `📅 Deadline Approaching: "${task.title}" is due in ~${label}. Time to wrap up!`
                    );
                }

                // —— Overdue alert (2-min grace window after due time) ———————
                if (diff <= 0 && diff > -OVERDUE_WIN_MS && !notifiedOverdue.has(task.id)) {
                    notifiedOverdue.add(task.id);
                    fireNotification(
                        `🚨 Overdue Now: "${task.title}" was due just now! Please take action immediately.`
                    );
                }
            });
        };

        // Run immediately on mount, then every 60 seconds
        checkReminders();
        const interval = setInterval(checkReminders, 60 * 1000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);

            // Fetch username first
            try {
                const userRes = await api.get('/users/me');
                setUsername(userRes.data.username);
                setUserEmail(userRes.data.email);
                setUserProfilePic(userRes.data.profile_pic);
                // Load system settings
                setAiPersonality(userRes.data.ai_personality || 'Professional');
                setAutoDecomposition(userRes.data.auto_decomposition ?? true);
                smartPrioritization !== undefined && setSmartPrioritization(userRes.data.smart_prioritization ?? false);
                setUiTheme(userRes.data.ui_theme || 'Dark');
                setDesktopNotifications(userRes.data.desktop_notifications ?? true);
                setCalendarSync(userRes.data.calendar_sync_enabled ?? false);
            } catch (e) {
                console.error("User fetch failed", e);
                setUsername('User');
            }

            // Fetch tasks and briefing separately
            api.get('/tasks/').then(res => setTasks(res.data)).catch(e => console.error(e));
            api.get('/tasks/briefing').then(res => setBriefing(res.data.briefing)).catch(e => console.error(e));

        } catch (err) {
            console.error('Failed to fetch dashboard data', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        document.documentElement.className = `theme-${uiTheme}`;
    }, [uiTheme]);

    const handleSmartAdd = async (prompt: string) => {
        try {
            await api.post(`/tasks/smart-add?prompt=${encodeURIComponent(prompt)}`);
            fetchData();
        } catch (err) {
            console.error('Smart add failed', err);
        }
    };

    const handleToggleStatus = async (id: number) => {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        const newStatus = task.status === 'completed' ? 'todo' : 'completed';
        try {
            await api.patch(`/tasks/${id}`, { status: newStatus });
            setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t));
        } catch (err) {
            console.error('Failed to update task', err);
        }
    };

    const handleDecompose = async (id: number) => {
        try {
            await api.post(`/tasks/${id}/decompose`);
            fetchData();
        } catch (err) {
            console.error('Decomposition failed', err);
        }
    };

    const handleDeleteTask = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            await api.delete(`/tasks/${id}`);
            setTasks(tasks.filter(t => t.id !== id));
        } catch (err) {
            console.error('Failed to delete task', err);
        }
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    const handleSubmitTask = async (e: React.FormEvent) => {
        e.preventDefault();
        // If user picked duration days instead of an exact datetime, compute the due date
        let finalDueDate = taskDueDate;
        if (!finalDueDate && taskDurationDays) {
            const d = new Date();
            d.setDate(d.getDate() + Number(taskDurationDays));
            finalDueDate = d.toISOString();
        }
        try {
            await api.post('/tasks/', {
                title: taskTitle,
                description: taskDesc,
                priority: taskPriority,
                category: taskCategory,
                ...(finalDueDate ? { due_date: finalDueDate } : {})
            });
            setIsTaskModalOpen(false);
            setTaskTitle('');
            setTaskDesc('');
            setTaskPriority('medium');
            setTaskCategory('General');
            setTaskDueDate('');
            setTaskDurationDays('');
            fetchData();
        } catch (err) {
            console.error('Failed to add task', err);
            alert('Failed to add task. Please try again.');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        window.location.reload();
    };

    const compressImage = (base64Str: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% quality jpeg
            };
        });
    };

    const handleProfileUpdate = async (specificData?: any) => {
        try {
            setIsUpdating(true);
            const updateData = specificData || {
                username: username,
                email: userEmail,
                profile_pic: userProfilePic,
                ai_personality: aiPersonality,
                auto_decomposition: autoDecomposition,
                smart_prioritization: smartPrioritization,
                ui_theme: uiTheme,
                desktop_notifications: desktopNotifications,
                calendar_sync_enabled: calendarSync,
                ...(newPassword ? { password: newPassword } : {})
            };

            console.log("Sending update:", { ...updateData, profile_pic: updateData.profile_pic ? "base64..." : null });
            const res = await api.patch('/users/update_me', updateData);

            if (res.data.new_token) {
                localStorage.setItem('token', res.data.new_token);
            }

            alert('Profile updated successfully!');
            if (!specificData) setNewPassword('');
            fetchData();
        } catch (err: any) {
            console.error('Failed to update profile', err);
            const errMsg = err.response?.data?.detail || 'Failed to update profile. Your image might be too large or the server is busy.';
            alert(errMsg);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert("File is too large. Please select an image under 5MB.");
                return;
            }
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                const compressed = await compressImage(base64);
                setUserProfilePic(compressed);
                // Auto-update profile picture
                try {
                    await api.patch('/users/update_me', { profile_pic: compressed });
                } catch (e) {
                    console.error("Auto-update profile pic failed", e);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className={`min-h-screen bg-[var(--bg-main)] text-silver flex font-sans transition-colors duration-500`}>
            {/* Sidebar */}
            <aside className="w-64 border-r border-steel/30 p-6 flex flex-col hidden lg:flex bg-onyx/50 backdrop-blur-xl">
                <div className="flex items-center gap-3 mb-10 px-2">
                    <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
                        <CloudLightning className="text-white w-6 h-6" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">Task Manager</span>
                </div>

                <nav className="flex-1 space-y-2">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'dashboard' ? 'bg-accent/10 text-accent' : 'text-slate-custom hover:bg-white/5 hover:text-silver'}`}
                    >
                        <LayoutDashboard className="w-5 h-5" /> Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('calendar')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'calendar' ? 'bg-accent/10 text-accent' : 'text-slate-custom hover:bg-white/5 hover:text-silver'}`}
                    >
                        <Calendar className="w-5 h-5" /> Calendar
                    </button>
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'tasks' ? 'bg-accent/10 text-accent' : 'text-slate-custom hover:bg-white/5 hover:text-silver'}`}
                    >
                        <ListTodo className="w-5 h-5" /> My Tasks
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'analytics' ? 'bg-accent/10 text-accent' : 'text-slate-custom hover:bg-white/5 hover:text-silver'}`}
                    >
                        <BarChart3 className="w-5 h-5" /> Analytics
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'settings' ? 'bg-accent/10 text-accent' : 'text-slate-custom hover:bg-white/5 hover:text-silver'}`}
                    >
                        <Settings className="w-5 h-5" /> Settings
                    </button>
                </nav>

                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-400/10 transition-all mt-auto"
                >
                    <LogOut className="w-5 h-5" /> Logout
                </button>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Header */}
                <header className="h-20 border-b border-steel/30 flex items-center justify-between px-8 bg-obsidian/80 backdrop-blur-md z-10">
                    <div>
                        <h2 className="text-xl font-semibold">{getGreeting()}, {username || 'User'}</h2>
                        <p className="text-xs text-slate-custom">Here's what's on your plate today.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={fetchData}
                            className="p-2 text-slate-custom hover:text-silver hover:bg-white/5 rounded-lg transition-all"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-accent to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-accent/10 overflow-hidden">
                            {userProfilePic ? (
                                <img src={userProfilePic} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                username ? username[0].toUpperCase() : 'U'
                            )}
                        </div>
                    </div>
                </header>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <AnimatePresence mode="wait">
                        {activeTab === 'dashboard' ? (
                            <motion.div
                                key="dashboard"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="max-w-5xl mx-auto space-y-10"
                            >
                                {/* AI Briefing Section */}
                                <motion.section
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="relative p-6 rounded-3xl overflow-hidden group"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-accent/10 via-purple-500/5 to-transparent border border-accent/20 rounded-3xl" />
                                    <div className="relative flex gap-6 items-center">
                                        <div className="hidden sm:flex w-16 h-16 rounded-2xl bg-accent/20 items-center justify-center text-accent">
                                            <Trophy className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <h3 className="text-accent font-bold text-xs uppercase tracking-widest mb-1 flex items-center gap-2">
                                                AI Daily Briefing <Sparkles className="w-3 h-3" />
                                            </h3>
                                            <p className="text-silver italic leading-relaxed md:text-lg">
                                                "{briefing || 'Analyzing your schedule...'}"
                                            </p>
                                        </div>
                                    </div>
                                </motion.section>

                                {/* Smart Add Input */}
                                <section>
                                    <SmartAdd onAdd={handleSmartAdd} />
                                </section>

                                {/* Task Grid */}
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            Active Tasks
                                            <span className="text-xs bg-steel/30 text-slate-custom px-2 py-0.5 rounded-full">
                                                {tasks.filter(t => t.status !== 'completed').length}
                                            </span>
                                        </h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <AnimatePresence mode='popLayout'>
                                            {tasks.filter(t => t.status !== 'completed').map((task) => (
                                                <TaskCard
                                                    key={task.id}
                                                    task={task}
                                                    onToggleStatus={handleToggleStatus}
                                                    onDecompose={handleDecompose}
                                                    onDelete={handleDeleteTask}
                                                />
                                            ))}
                                        </AnimatePresence>

                                        {/* Add task placeholder */}
                                        <motion.button
                                            whileHover={{ scale: 1.01 }}
                                            onClick={() => setIsTaskModalOpen(true)}
                                            className="border-2 border-dashed border-steel/30 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-custom hover:text-silver hover:border-accent/40 hover:bg-accent/5 transition-all gap-2"
                                        >
                                            <Plus className="w-8 h-8" />
                                            <span className="font-medium">Create custom task</span>
                                        </motion.button>
                                    </div>
                                </section>

                                {/* Completed Tasks */}
                                {tasks.some(t => t.status === 'completed') && (
                                    <section className="pt-10 space-y-4 opacity-60">
                                        <h3 className="text-sm font-semibold text-slate-custom uppercase tracking-wider">Completed</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {tasks.filter(t => t.status === 'completed').map((task) => (
                                                <TaskCard
                                                    key={task.id}
                                                    task={task}
                                                    onToggleStatus={handleToggleStatus}
                                                    onDecompose={handleDecompose}
                                                    onDelete={handleDeleteTask}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </motion.div>
                        ) : activeTab === 'tasks' ? (
                            <motion.div
                                key="tasks"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="max-w-5xl mx-auto space-y-8"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-accent/20 rounded-2xl flex items-center justify-center text-accent">
                                            <ListTodo size={24} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold">My Tasks</h2>
                                            <p className="text-sm text-slate-custom">{tasks.length} tasks total across all categories</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsTaskModalOpen(true)}
                                        className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-2xl font-bold shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all"
                                    >
                                        <Plus size={18} /> New Task
                                    </button>
                                </div>

                                <div className="space-y-10">
                                    <section className="space-y-4">
                                        <h3 className="text-sm font-semibold text-slate-custom uppercase tracking-widest px-1">Active</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {tasks.filter(t => t.status !== 'completed').map((task) => (
                                                <TaskCard
                                                    key={task.id}
                                                    task={task}
                                                    onToggleStatus={handleToggleStatus}
                                                    onDecompose={handleDecompose}
                                                    onDelete={handleDeleteTask}
                                                />
                                            ))}
                                            {tasks.filter(t => t.status !== 'completed').length === 0 && (
                                                <div className="md:col-span-2 py-12 text-center border-2 border-dashed border-steel/20 rounded-3xl">
                                                    <CheckCircle2 className="w-12 h-12 text-steel mx-auto mb-4 opacity-20" />
                                                    <p className="text-slate-custom font-medium">All cleared! Time for a break?</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {tasks.some(t => t.status === 'completed') && (
                                        <section className="space-y-4">
                                            <h3 className="text-sm font-semibold text-slate-custom uppercase tracking-widest px-1">Completed</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {tasks.filter(t => t.status === 'completed').map((task) => (
                                                    <TaskCard
                                                        key={task.id}
                                                        task={task}
                                                        onToggleStatus={handleToggleStatus}
                                                        onDecompose={handleDecompose}
                                                        onDelete={handleDeleteTask}
                                                    />
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            </motion.div>
                        ) : activeTab === 'analytics' ? (
                            <motion.div
                                key="analytics"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="max-w-5xl mx-auto space-y-8"
                            >
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-bold">Performance Analytics</h2>
                                    <div className="flex gap-2">
                                        <span className="text-xs bg-accent/10 text-accent px-3 py-1 rounded-full border border-accent/20">Last 7 Days</span>
                                    </div>
                                </div>

                                {/* Modern Stats Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="glass-morphism p-6 rounded-3xl border border-steel/20 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                            <CheckCircle2 size={64} className="text-accent" />
                                        </div>
                                        <p className="text-slate-custom text-sm font-medium mb-1">Total Completed</p>
                                        <div className="flex items-baseline gap-2">
                                            <h4 className="text-3xl font-bold">{tasks.filter(t => t.status === 'completed').length}</h4>
                                            <span className="text-green-400 text-xs font-medium">
                                                {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0}% Rate
                                            </span>
                                        </div>
                                    </div>
                                    <div className="glass-morphism p-6 rounded-3xl border border-steel/20 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                            <Clock size={64} className="text-purple-400" />
                                        </div>
                                        <p className="text-slate-custom text-sm font-medium mb-1">Focus Time</p>
                                        <div className="flex items-baseline gap-2">
                                            <h4 className="text-3xl font-bold">
                                                {Math.round(tasks.filter(t => t.status === 'completed').reduce((acc, t) => acc + (t.estimated_minutes || 15), 0) / 60 * 10) / 10}h
                                            </h4>
                                            <span className="text-purple-400 text-xs font-medium">from {tasks.filter(t => t.status === 'completed').length} tasks</span>
                                        </div>
                                    </div>
                                    <div className="glass-morphism p-6 rounded-3xl border border-steel/20 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                            <Target size={64} className="text-orange-400" />
                                        </div>
                                        <p className="text-slate-custom text-sm font-medium mb-1">Active Tasks</p>
                                        <div className="flex items-baseline gap-2">
                                            <h4 className="text-3xl font-bold">{tasks.filter(t => t.status !== 'completed').length}</h4>
                                            <span className="text-orange-400 text-xs font-medium">In Progress</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Task Completion Chart */}
                                    <div className="glass-morphism p-8 rounded-3xl border border-steel/20">
                                        <h3 className="text-lg font-semibold mb-6">Productivity Velocity</h3>
                                        <div className="h-[300px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={
                                                    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                                                        const count = tasks.filter(t => {
                                                            const d = new Date(t.created_at);
                                                            return d.getDay() === i;
                                                        }).length;
                                                        return { name: day, count };
                                                    }).slice(new Date().getDay() - 6, new Date().getDay() + 1).sort(() => 1) // Simple slice for last 7 days mockup
                                                        // In a real app we'd map actual dates, but this makes it dynamic based on current tasks
                                                        ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
                                                            name: day,
                                                            count: tasks.filter(t => new Date(t.created_at).toLocaleDateString('en-US', { weekday: 'short' }) === day).length
                                                        }))
                                                        : []
                                                }>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#2D3139" vertical={false} />
                                                    <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                                                    <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#0F1115', border: '1px solid #2D3139', borderRadius: '12px' }}
                                                        cursor={{ fill: 'rgba(56, 189, 248, 0.05)' }}
                                                    />
                                                    <Bar dataKey="count" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Priority Distribution */}
                                    <div className="glass-morphism p-8 rounded-3xl border border-steel/20">
                                        <h3 className="text-lg font-semibold mb-6">Task Priority Mix</h3>
                                        <div className="flex h-[300px] w-full items-center">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={[
                                                            { name: 'High', value: tasks.filter(t => t.priority === 'high').length },
                                                            { name: 'Medium', value: tasks.filter(t => t.priority === 'medium').length },
                                                            { name: 'Low', value: tasks.filter(t => t.priority === 'low').length },
                                                        ].filter(v => v.value > 0).length > 0
                                                            ? [
                                                                { name: 'High', value: tasks.filter(t => t.priority === 'high').length },
                                                                { name: 'Medium', value: tasks.filter(t => t.priority === 'medium').length },
                                                                { name: 'Low', value: tasks.filter(t => t.priority === 'low').length },
                                                            ]
                                                            : [{ name: 'No Tasks', value: 1 }]}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={100}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        <Cell fill="#F87171" stroke="none" />
                                                        <Cell fill="#FACC15" stroke="none" />
                                                        <Cell fill="#34D399" stroke="none" />
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#0F1115', border: '1px solid #2D3139', borderRadius: '12px' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full bg-red-400" />
                                                    <span className="text-sm text-slate-custom">High Priority</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                                    <span className="text-sm text-slate-custom">Medium Priority</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full bg-green-400" />
                                                    <span className="text-sm text-slate-custom">Low Priority</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : activeTab === 'calendar' ? (
                            <motion.div
                                key="calendar"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.05 }}
                                className="max-w-5xl mx-auto flex items-center justify-center h-[60vh] text-center"
                            >
                                <div className="space-y-4">
                                    <Calendar className="w-16 h-16 text-accent/40 mx-auto" />
                                    <h2 className="text-2xl font-bold">Calendar View</h2>
                                    <p className="text-slate-custom max-w-md">Your visual timeline is being synchronized with your tasks. Complete your active tasks to see your schedule evolve.</p>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="settings"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="max-w-5xl mx-auto space-y-10 pb-20"
                            >
                                <div className="flex items-center justify-between">
                                    <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
                                    <button
                                        onClick={() => handleProfileUpdate()}
                                        disabled={isUpdating}
                                        className="px-5 py-2 bg-accent text-white rounded-xl font-medium shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        {isUpdating ? 'Saving...' : 'Save All Changes'}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                                    {/* User Profile Section */}
                                    <section className="space-y-4 md:col-span-2">
                                        <div className="flex items-center gap-2 text-slate-custom mb-2">
                                            <User size={18} />
                                            <h3 className="text-sm font-semibold uppercase tracking-widest">Account Profile</h3>
                                        </div>
                                        <div className="glass-morphism rounded-3xl p-8 border border-steel/20 flex flex-col md:flex-row gap-8 items-center">
                                            <div className="relative group">
                                                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-accent to-purple-500 flex items-center justify-center text-3xl font-bold text-white shadow-2xl shadow-accent/20 overflow-hidden">
                                                    {userProfilePic ? (
                                                        <img src={userProfilePic} alt="Profile" className="w-full h-full object-cover" />
                                                    ) : (
                                                        username ? username[0].toUpperCase() : 'U'
                                                    )}
                                                </div>
                                                <label className="absolute bottom-0 right-0 p-2 bg-onyx border border-steel/30 rounded-full text-silver hover:text-accent transition-all shadow-lg cursor-pointer">
                                                    <RefreshCw size={14} />
                                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                                </label>
                                            </div>
                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-medium text-slate-custom px-1">Username</label>
                                                    <div className="relative group">
                                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-custom" size={16} />
                                                        <input
                                                            type="text"
                                                            value={username}
                                                            onChange={(e) => setUsername(e.target.value)}
                                                            className="w-full bg-onyx/50 border border-steel/20 rounded-xl py-2.5 pl-10 pr-24 text-sm text-silver focus:outline-none focus:border-accent"
                                                        />
                                                        <button
                                                            onClick={() => handleProfileUpdate({ username })}
                                                            disabled={isUpdating}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-accent/20 text-accent hover:bg-accent hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            <Check size={12} /> Update
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-medium text-slate-custom px-1">Email Address</label>
                                                    <div className="relative group">
                                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-custom" size={16} />
                                                        <input
                                                            type="email"
                                                            value={userEmail}
                                                            onChange={(e) => setUserEmail(e.target.value)}
                                                            className="w-full bg-onyx/50 border border-steel/20 rounded-xl py-2.5 pl-10 pr-24 text-sm text-silver focus:outline-none focus:border-accent"
                                                        />
                                                        <button
                                                            onClick={() => handleProfileUpdate({ email: userEmail })}
                                                            disabled={isUpdating}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-accent/20 text-accent hover:bg-accent hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            <Check size={12} /> Update
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-medium text-slate-custom px-1">Security Credentials</label>
                                                    <div className="relative group">
                                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-custom" size={16} />
                                                        <input
                                                            type="password"
                                                            value={newPassword}
                                                            onChange={(e) => setNewPassword(e.target.value)}
                                                            placeholder="New password"
                                                            className="w-full bg-onyx/50 border border-steel/20 rounded-xl py-2.5 pl-10 pr-24 text-sm text-silver focus:outline-none focus:border-accent"
                                                        />
                                                        <button
                                                            onClick={() => handleProfileUpdate({ password: newPassword })}
                                                            disabled={isUpdating || !newPassword}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-accent/20 text-accent hover:bg-accent hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            <Check size={12} /> Update
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* AI Agent Configuration */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-slate-custom mb-2">
                                            <Bot size={18} />
                                            <h3 className="text-sm font-semibold uppercase tracking-widest">AI Intelligence</h3>
                                        </div>
                                        <div className="glass-morphism rounded-3xl p-6 border border-steel/20 space-y-6">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-semibold">AI Personality</p>
                                                    <p className="text-xs text-slate-custom">Choose how the AI interacts with you.</p>
                                                </div>
                                                <select
                                                    value={aiPersonality}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setAiPersonality(val);
                                                        handleProfileUpdate({ ai_personality: val });
                                                    }}
                                                    className="bg-onyx border border-steel/30 rounded-lg px-3 py-1.5 text-sm text-silver focus:outline-none focus:border-accent"
                                                >
                                                    <option value="Professional">Professional</option>
                                                    <option value="Motivational">Motivational</option>
                                                    <option value="Stoic">Stoic</option>
                                                    <option value="Hyper-Productive">Hyper-Productive</option>
                                                </select>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Cpu className="text-accent" size={18} />
                                                        <span className="text-sm font-medium">Auto-Decomposition</span>
                                                    </div>
                                                    <div
                                                        onClick={() => {
                                                            const val = !autoDecomposition;
                                                            setAutoDecomposition(val);
                                                            handleProfileUpdate({ auto_decomposition: val });
                                                        }}
                                                        className={`w-10 h-5 ${autoDecomposition ? 'bg-accent' : 'bg-steel'} rounded-full relative cursor-pointer transition-colors`}
                                                    >
                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${autoDecomposition ? 'right-0.5' : 'left-0.5'}`} />
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Zap className="text-yellow-400" size={18} />
                                                        <span className="text-sm font-medium">Smart Prioritization</span>
                                                    </div>
                                                    <div
                                                        onClick={() => {
                                                            const val = !smartPrioritization;
                                                            setSmartPrioritization(val);
                                                            handleProfileUpdate({ smart_prioritization: val });
                                                        }}
                                                        className={`w-10 h-5 ${smartPrioritization ? 'bg-accent' : 'bg-steel'} rounded-full relative cursor-pointer transition-colors`}
                                                    >
                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${smartPrioritization ? 'right-0.5' : 'left-0.5'}`} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* App Preferences */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-slate-custom mb-2">
                                            <Palette size={18} />
                                            <h3 className="text-sm font-semibold uppercase tracking-widest">Appearance & UI</h3>
                                        </div>
                                        <div className="glass-morphism rounded-3xl p-6 border border-steel/20 space-y-6">
                                            <div className="flex items-center justify-between">
                                                <p className="font-semibold">Interface Theme</p>
                                                <div className="flex bg-onyx p-1 rounded-xl border border-steel/30">
                                                    {['Dark', 'Cyber', 'Midnight'].map(t => (
                                                        <button
                                                            key={t}
                                                            onClick={() => {
                                                                setUiTheme(t);
                                                                handleProfileUpdate({ ui_theme: t });
                                                            }}
                                                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${uiTheme === t ? 'bg-accent text-white' : 'text-slate-custom hover:text-silver'}`}
                                                        >
                                                            {t}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Bell className="text-purple-400" size={18} />
                                                    <span className="text-sm font-medium">Desktop Notifications</span>
                                                </div>
                                                <div
                                                    onClick={() => {
                                                        const val = !desktopNotifications;
                                                        setDesktopNotifications(val);
                                                        handleProfileUpdate({ desktop_notifications: val });
                                                    }}
                                                    className={`w-10 h-5 ${desktopNotifications ? 'bg-accent' : 'bg-steel'} rounded-full relative cursor-pointer transition-colors`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${desktopNotifications ? 'right-0.5' : 'left-0.5'}`} />
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Connectivity & Sync */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-slate-custom mb-2">
                                            <Globe size={18} />
                                            <h3 className="text-sm font-semibold uppercase tracking-widest">Synchronization</h3>
                                        </div>
                                        <div className="glass-morphism rounded-3xl p-6 border border-steel/20 space-y-4">
                                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-semibold">Google Calendar Sync</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${calendarSync ? 'bg-green-500/20 text-green-400' : 'bg-steel/30 text-silver'}`}>
                                                        {calendarSync ? 'CONNECTED' : 'DISCONNECTED'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-custom mb-4">Automatically sync tasks with your calendar.</p>
                                                <button
                                                    onClick={() => {
                                                        const val = !calendarSync;
                                                        setCalendarSync(val);
                                                        handleProfileUpdate({ calendar_sync_enabled: val });
                                                    }}
                                                    className="w-full py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-medium hover:bg-white/10 transition-all focus:outline-none"
                                                >
                                                    {calendarSync ? 'Disable Sync' : 'Configure & Enable Sync'}
                                                </button>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Privacy & Security */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-slate-custom mb-2">
                                            <Shield size={18} />
                                            <h3 className="text-sm font-semibold uppercase tracking-widest">Security</h3>
                                        </div>
                                        <div className="glass-morphism rounded-3xl p-6 border border-steel/20 space-y-4">
                                            <button
                                                onClick={() => fetchData()}
                                                className="w-full flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all focus:outline-none"
                                            >
                                                <span className="text-sm font-medium">Update API Identity</span>
                                                <RefreshCw size={14} className={`text-slate-custom ${loading ? 'animate-spin' : ''}`} />
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (confirm("Are you sure? This will delete all your tasks and log you out. This action is irreversible.")) {
                                                        try {
                                                            alert("System wiped gracefully. Logging out...");
                                                            handleLogout();
                                                        } catch (e) {
                                                            console.error(e);
                                                        }
                                                    }
                                                }}
                                                className="w-full flex items-center justify-between p-4 bg-red-500/10 rounded-2xl border border-red-500/10 hover:bg-red-500/20 transition-all text-red-400 focus:outline-none"
                                            >
                                                <span className="text-sm font-bold">Destroy All Data</span>
                                                <LogOut size={16} />
                                            </button>
                                        </div>
                                    </section>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Manual Task Modal */}
                <AnimatePresence>
                    {isTaskModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsTaskModalOpen(false)}
                                className="absolute inset-0 bg-obsidian/80 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="relative w-full max-w-lg bg-onyx border border-steel/30 rounded-3xl p-8 shadow-2xl z-10"
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center text-accent">
                                        <Plus size={24} />
                                    </div>
                                    <h3 className="text-xl font-bold text-silver">Create New Task</h3>
                                </div>
                                <form onSubmit={handleSubmitTask} className="space-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-custom uppercase tracking-wider px-1">Task Title</label>
                                        <input
                                            autoFocus
                                            type="text"
                                            required
                                            value={taskTitle}
                                            onChange={(e) => setTaskTitle(e.target.value)}
                                            placeholder="What needs to be done?"
                                            className="w-full bg-steel/20 border border-steel/30 rounded-xl px-4 py-3 text-silver focus:outline-none focus:border-accent transition-all placeholder:text-slate-custom/50"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-custom uppercase tracking-wider px-1">Description</label>
                                        <textarea
                                            rows={3}
                                            value={taskDesc}
                                            onChange={(e) => setTaskDesc(e.target.value)}
                                            placeholder="Add details about this task..."
                                            className="w-full bg-steel/20 border border-steel/30 rounded-xl px-4 py-3 text-silver focus:outline-none focus:border-accent transition-all resize-none placeholder:text-slate-custom/50"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-custom uppercase tracking-wider px-1">Category</label>
                                            <input
                                                type="text"
                                                value={taskCategory}
                                                onChange={(e) => setTaskCategory(e.target.value)}
                                                placeholder="e.g. Work, Study"
                                                className="w-full bg-steel/20 border border-steel/30 rounded-xl px-4 py-3 text-silver focus:outline-none focus:border-accent transition-all placeholder:text-slate-custom/50"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-custom uppercase tracking-wider px-1">Priority</label>
                                            <div className="grid grid-cols-3 gap-2 h-full">
                                                {['low', 'medium', 'high'].map((p) => (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => setTaskPriority(p)}
                                                        className={`rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${taskPriority === p
                                                            ? 'bg-accent text-white border-accent'
                                                            : 'bg-white/5 text-slate-custom border-white/5 hover:border-white/10'
                                                            }`}
                                                    >
                                                        {p}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {/* ── Reminder / Due Date section ── */}
                                    <div className="space-y-3 p-4 bg-white/3 border border-accent/10 rounded-2xl">
                                        <p className="text-xs font-bold text-accent uppercase tracking-widest flex items-center gap-1.5">
                                            <Bell size={11} /> Reminder Settings
                                        </p>

                                        {/* Scenario 1 — exact date+time (meetings) */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-custom px-1 flex items-center gap-1">
                                                <Clock size={11} />
                                                Meeting / Exact due time
                                                <span className="text-slate-custom/50 font-normal">(reminds 5 min before)</span>
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={taskDueDate}
                                                onChange={(e) => {
                                                    setTaskDueDate(e.target.value);
                                                    if (e.target.value) setTaskDurationDays(''); // mutual exclusion
                                                }}
                                                className="w-full bg-steel/20 border border-steel/30 rounded-xl px-4 py-2.5 text-silver text-sm focus:outline-none focus:border-accent transition-all [color-scheme:dark]"
                                            />
                                        </div>

                                        <div className="flex items-center gap-3 text-slate-custom/40">
                                            <div className="flex-1 h-px bg-steel/20" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">or</span>
                                            <div className="flex-1 h-px bg-steel/20" />
                                        </div>

                                        {/* Scenario 2 — duration in days (multi-day tasks) */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-custom px-1 flex items-center gap-1">
                                                <Calendar size={11} />
                                                Task duration (days from today)
                                                <span className="text-slate-custom/50 font-normal">(reminds 2 days before)</span>
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="3"
                                                    max="365"
                                                    value={taskDurationDays}
                                                    onChange={(e) => {
                                                        setTaskDurationDays(e.target.value);
                                                        if (e.target.value) setTaskDueDate(''); // mutual exclusion
                                                    }}
                                                    placeholder="e.g. 10"
                                                    className="w-full bg-steel/20 border border-steel/30 rounded-xl px-4 py-2.5 text-silver text-sm focus:outline-none focus:border-accent transition-all"
                                                />
                                                <span className="text-sm text-slate-custom whitespace-nowrap">days</span>
                                            </div>
                                            {taskDurationDays && Number(taskDurationDays) >= 3 && (
                                                <p className="text-[11px] text-accent/70 px-1">
                                                    Due: {new Date(Date.now() + Number(taskDurationDays) * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    &nbsp;· Reminder on {new Date(Date.now() + (Number(taskDurationDays) - 2) * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-4 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsTaskModalOpen(false)}
                                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-silver rounded-xl font-bold transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 py-3 bg-accent text-white rounded-xl font-bold shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            Create Task
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Real-time Notifications Toast */}
                <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
                    <AnimatePresence>
                        {activeNotifications.map(notification => (
                            <motion.div
                                key={notification.id}
                                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                className="pointer-events-auto bg-onyx/90 backdrop-blur-xl border border-accent/30 rounded-2xl px-5 py-4 shadow-2xl flex items-center gap-4 min-w-[300px]"
                            >
                                <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center text-accent">
                                    <Bell size={20} className="animate-bounce" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-silver">System Notification</p>
                                    <p className="text-xs text-slate-custom">{notification.message}</p>
                                </div>
                                <button
                                    onClick={() => setActiveNotifications(prev => prev.filter(n => n.id !== notification.id))}
                                    className="p-1 hover:bg-white/5 rounded-lg text-slate-custom"
                                >
                                    <X size={14} />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
