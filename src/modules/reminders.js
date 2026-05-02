// ==================== REMINDERS MODULE ====================

import AppState, { getReminders, setReminders } from './state.js';
import { showNotification } from './notifications.js';
import { playNotificationSound } from './sounds.js';
import { saveReminderToFirebase, deleteReminderFromFirebase } from './firebase-sync.js';

export function initializeReminders() {
    // Set up event delegation for reminders list (only once)
    const list = document.getElementById('reminderList');
    list.addEventListener('click', (e) => {
        if (e.target.classList.contains('reminder-delete')) {
            const reminderItem = e.target.closest('.reminder-item');
            if (reminderItem && reminderItem.dataset.reminderId) {
                deleteReminder(reminderItem.dataset.reminderId);
            }
        }
    });

    renderReminders();

    document.getElementById('addReminderBtn').addEventListener('click', addReminder);

    document.getElementById('reminderRepeat').addEventListener('change', (e) => {
        document.getElementById('reminderRepeatInterval').disabled = !e.target.checked;
    });
}

function addReminder() {
    const input = document.getElementById('reminderInput');
    const timeInput = document.getElementById('reminderTime');
    const repeat = document.getElementById('reminderRepeat').checked;
    const interval = document.getElementById('reminderRepeatInterval').value;

    const text = input.value.trim();
    const time = timeInput.value;

    if (!text || !time) {
        alert('Lütfen hatırlatma metni ve zamanı girin!');
        return;
    }

    const reminder = {
        id: Date.now().toString(),
        text,
        time: new Date(time).toISOString(),
        repeat,
        interval: repeat ? interval : null,
        active: true
    };

    const reminders = getReminders();
    reminders.unshift(reminder);
    setReminders(reminders);
    saveReminderToFirebase(reminder);
    renderReminders();

    input.value = '';
    timeInput.value = '';
    document.getElementById('reminderRepeat').checked = false;
    document.getElementById('reminderRepeatInterval').disabled = true;
}

export function deleteReminder(id) {
    id = String(id);
    const reminders = getReminders();
    setReminders(reminders.filter(r => String(r.id) !== id));
    deleteReminderFromFirebase(id);
    renderReminders();
}

export function renderReminders() {
    const reminders = getReminders();
    const list = document.getElementById('reminderList');

    if (reminders.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">Henüz hatırlatma yok</p>';
        return;
    }

    list.innerHTML = reminders.map(reminder => {
        const date = new Date(reminder.time);
        const formattedDate = date.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="reminder-item" data-reminder-id="${reminder.id}">
                <div class="reminder-header">
                    <span class="reminder-title">${reminder.text}</span>
                    <button class="reminder-delete">×</button>
                </div>
                <div class="reminder-time-display">
                    ${formattedDate}
                    ${reminder.repeat ? `<span class="reminder-repeat">${getRepeatText(reminder.interval)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function getRepeatText(interval) {
    const texts = {
        'daily': 'Günlük',
        'weekly': 'Haftalık',
        'monthly': 'Aylık'
    };
    return texts[interval] || '';
}

export function checkReminders() {
    const reminders = getReminders();
    const now = new Date();

    reminders.forEach(reminder => {
        if (!reminder.active) return;

        const reminderTime = new Date(reminder.time);

        if (now >= reminderTime) {
            showNotification('Hatırlatma!', reminder.text);
            playNotificationSound();

            if (reminder.repeat) {
                const next = new Date(reminderTime);
                switch (reminder.interval) {
                    case 'daily':
                        next.setDate(next.getDate() + 1);
                        break;
                    case 'weekly':
                        next.setDate(next.getDate() + 7);
                        break;
                    case 'monthly':
                        next.setMonth(next.getMonth() + 1);
                        break;
                }
                reminder.time = next.toISOString();
            } else {
                reminder.active = false;
            }

            setReminders(reminders);

            if (AppState.isSyncEnabled && AppState.currentUser) {
                saveReminderToFirebase(reminder);
            }
        }
    });
}
