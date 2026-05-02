// ==================== APPLICATION STATE ====================
// Merkezi state yönetimi

export const AppState = {
    // Data
    todos: JSON.parse(localStorage.getItem('todos')) || [],
    reminders: JSON.parse(localStorage.getItem('reminders')) || [],
    notes: JSON.parse(localStorage.getItem('notes')) || [],
    
    // Stats
    stats: JSON.parse(localStorage.getItem('stats')) || {
        totalTasks: 0,
        completedTasks: 0,
        totalPomodoros: 0,
        totalMinutes: 0
    },
    
    // Pomodoro
    pomodoroState: {
        isRunning: false,
        isPaused: false,
        currentSession: 'work',
        timeLeft: 25 * 60,
        completedPomodoros: 0,
        totalTime: 0
    },
    
    // UI State
    currentFilter: 'active',
    currentCategory: 'all',
    currentNoteId: null,
    isDarkTheme: localStorage.getItem('theme') === 'light' ? false : true,
    
    // Settings
    isLocked: localStorage.getItem('isLocked') === null ? true : localStorage.getItem('isLocked') === 'true',
    currentPalette: localStorage.getItem('palette') || 'indigo',
    currentOpacity: parseInt(localStorage.getItem('opacity') || '100'),
    soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
    animationsEnabled: localStorage.getItem('animationsEnabled') === 'true',
    categoryFiltersVisible: localStorage.getItem('categoryFiltersVisible') === null ? true : localStorage.getItem('categoryFiltersVisible') === 'true',
    
    // Selection
    selectedCategory: 'work',
    
    // Firebase
    currentUser: null,
    isSyncEnabled: false,
    syncListeners: [],
    
    // Drag & Drop
    draggedElement: null,
    reminderIntervals: []
};

// Getters
export const getTodos = () => AppState.todos;
export const getReminders = () => AppState.reminders;
export const getNotes = () => AppState.notes;
export const getStats = () => AppState.stats;
export const getPomodoroState = () => AppState.pomodoroState;
export const getCurrentUser = () => AppState.currentUser;
export const isSyncEnabled = () => AppState.isSyncEnabled;

// Setters
export const setTodos = (todos) => {
    AppState.todos = todos;
    localStorage.setItem('todos', JSON.stringify(todos));
};

export const setReminders = (reminders) => {
    AppState.reminders = reminders;
    localStorage.setItem('reminders', JSON.stringify(reminders));
};

export const setNotes = (notes) => {
    AppState.notes = notes;
    localStorage.setItem('notes', JSON.stringify(notes));
};

export const setStats = (stats) => {
    AppState.stats = stats;
    localStorage.setItem('stats', JSON.stringify(stats));
};

export const setCurrentUser = (user) => {
    AppState.currentUser = user;
};

export const setSyncEnabled = (enabled) => {
    AppState.isSyncEnabled = enabled;
};

export default AppState;
