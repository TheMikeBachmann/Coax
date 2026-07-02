const throttle = require('./throttle');
const { isShowBlocked, MINUTE } = require('./show-settings-helpers');

const DAY = 24 * 60 * MINUTE;

// Returns true when a show has any scheduling constraint
function hasConstraint(settings) {
    if (!settings) return false;
    return (
        (Array.isArray(settings.allowedDays) && settings.allowedDays.length > 0) ||
        !!settings.allowedStart ||
        !!settings.allowedEnd
    );
}

module.exports = async function buildSettingsSchedule(programs, showSettings = {}, daysToGenerate = 14) {
    const showEpisodes = {};
    const showOrder    = [];

    // Group programs by show title, skip offline, deduplicate
    for (const p of programs) {
        if (p.isOffline || !p.duration) continue;
        const title = p.showTitle || '__unlabeled__';
        if (!showEpisodes[title]) {
            showEpisodes[title] = [];
            showEpisodes[title]._seen = new Set();
            showOrder.push(title);
        }
        const key = p.ratingKey || `${p.file ?? ''}.${p.season ?? 0}.${p.episode ?? 0}`;
        if (showEpisodes[title]._seen.has(key)) continue;
        showEpisodes[title]._seen.add(key);
        showEpisodes[title].push(p);
    }

    if (showOrder.length === 0) {
        return { programs: [], startTime: new Date().toISOString() };
    }

    // Sort or shuffle each show's episodes
    for (const title of showOrder) {
        const eps      = showEpisodes[title];
        const settings = showSettings[title];
        if (settings?.forceOrder) {
            eps.sort((a, b) => {
                const ds = (a.season ?? 0) - (b.season ?? 0);
                return ds !== 0 ? ds : (a.episode ?? 0) - (b.episode ?? 0);
            });
        } else {
            for (let i = eps.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [eps[i], eps[j]] = [eps[j], eps[i]];
            }
        }
    }

    const positions  = {};
    const lastPlayed = {};
    for (const title of showOrder) {
        positions[title]  = 0;
        lastPlayed[title] = -Infinity;
    }

    const now       = Date.now();
    const hardLimit = now + daysToGenerate * DAY;
    let   t         = now;
    const result    = [];

    while (t < hardLimit) {
        await throttle();

        // Shows not blocked at time t
        const eligible = showOrder.filter(
            title => !isShowBlocked(showSettings, { showTitle: title, isOffline: false }, t)
        );

        if (eligible.length === 0) {
            result.push({ isOffline: true, duration: 30 * MINUTE });
            t += 30 * MINUTE;
            continue;
        }

        // During a restricted show's window, only restricted shows play.
        // This guarantees e.g. R&S dominates its evening slot.
        const restricted   = eligible.filter(title => hasConstraint(showSettings[title]));
        const unrestricted = eligible.filter(title => !hasConstraint(showSettings[title]));
        const pool         = restricted.length > 0 ? restricted : unrestricted;

        // Round-robin: pick the show played least recently
        pool.sort((a, b) => lastPlayed[a] - lastPlayed[b]);
        const chosen = pool[0];

        const eps = showEpisodes[chosen];
        const ep  = eps[positions[chosen] % eps.length];

        result.push({ ...ep });
        lastPlayed[chosen] = t;
        positions[chosen]++;
        t += ep.duration;
    }

    // Pad to an exact multiple of the generated window so the schedule
    // doesn't drift when it loops around.
    const totalMs      = result.reduce((s, p) => s + p.duration, 0);
    const targetMs     = daysToGenerate * DAY;
    const remainingMs  = targetMs - totalMs;
    if (remainingMs > 0) {
        result.push({ isOffline: true, duration: remainingMs });
    }

    return {
        programs:  result,
        startTime: new Date(now).toISOString(),
    };
};
