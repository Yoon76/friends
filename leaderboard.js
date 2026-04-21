// Supabase Configuration
const SUPABASE_URL = 'https://sqbdiniogmxxwolckozp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qq32D3lzkUOGvc_5HaZMiQ_1lnmiZOZ';

// Initialize Supabase Client
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function initLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    loadLeaderboard();

    // Subscribe to realtime updates
    _supabase
        .channel('public:mog_leaderboard')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mog_leaderboard' }, () => {
            loadLeaderboard();
        })
        .subscribe();
}

async function loadLeaderboard() {
    const { data, error } = await _supabase
        .from('mog_leaderboard')
        .select('*')
        .order('votes', { ascending: false });

    const container = document.getElementById('leaderboard-list');
    if (error || !data) return;

    container.innerHTML = data.map((item, index) => {
        const isTop = index === 0;
        return `
            <div class="leaderboard-item ${isTop ? 'top-dog' : ''}">
                <div class="lb-rank">#${index + 1}</div>
                <div class="lb-info">
                    <span class="lb-name">${item.name}</span>
                    <span class="lb-votes">${item.votes} Aura</span>
                </div>
                <button class="lb-vote-btn" onclick="vote('${item.id}', ${item.votes})">MOG</button>
            </div>
        `;
    }).join('');
}

async function vote(id, currentVotes) {
    const { error } = await _supabase
        .from('mog_leaderboard')
        .update({ votes: currentVotes + 1 })
        .eq('id', id);

    if (error) {
        console.error('Vote failed:', error.message);
    }
}

document.addEventListener('DOMContentLoaded', initLeaderboard);
