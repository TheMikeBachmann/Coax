const MINUTE = 60 * 1000;

function parseTimeMin(str) {
    if (!str) return null;
    const [hh, mm] = str.split(':').map(Number);
    return hh * 60 + (mm || 0);
}

// Returns true if the program should not play at time t (ms epoch)
// program needs: { showTitle, isOffline }
// showSettings: Record<showTitle, ShowSetting>
function isShowBlocked(showSettings, program, t) {
    if (!showSettings || !program || program.isOffline || !program.showTitle) return false;
    const settings = showSettings[program.showTitle];
    if (!settings) return false;
    const date = new Date(t);
    const day  = date.getDay();
    if (Array.isArray(settings.allowedDays) && settings.allowedDays.length > 0) {
        if (!settings.allowedDays.includes(day)) return true;
    }
    if (settings.allowedStart || settings.allowedEnd) {
        const timeMin = date.getHours() * 60 + date.getMinutes();
        const start   = parseTimeMin(settings.allowedStart) ?? 0;
        const end     = parseTimeMin(settings.allowedEnd)   ?? (23 * 60 + 59);
        if (end < start) {
            if (timeMin < start && timeMin > end) return true;
        } else {
            if (timeMin < start || timeMin > end) return true;
        }
    }
    return false;
}

module.exports = { parseTimeMin, isShowBlocked, MINUTE };
