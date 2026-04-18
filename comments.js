// Supabase Configuration
const SUPABASE_URL = 'https://sqbdiniogmxxwolckozp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qq32D3lzkUOGvc_5HaZMiQ_1lnmiZOZ';

// Initialize Supabase Client
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sanitize(str) {
    if (!str) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return str.replace(reg, (match) => map[match]).trim();
}

async function initComments(profileId) {
    const container = document.getElementById('comments-container');
    if (!container) return;

    // Check current session
    let { data: { session } } = await _supabase.auth.getSession();

    renderLayout(container, session);
    loadComments(profileId);

    // Listen for auth changes
    _supabase.auth.onAuthStateChange((_event, session) => {
        renderLayout(container, session);
        loadComments(profileId);
    });
}

function renderLayout(container, session) {
    const user = session?.user;
    const displayName = user?.user_metadata?.full_name || user?.email || 'Authenticated User';

    container.innerHTML = `
        <section class="comments-section" style="padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4rem;">
            <p class="section-tag">05 — Community</p>
            <h2 style="margin-bottom: 2rem;">The Feedback<br>Loop</h2>
            
            <div id="auth-area" style="margin-bottom: 3rem;">
                ${!user ? `
                    <div style="background: rgba(255,255,255,0.02); padding: 3rem; border: 1px solid rgba(255,255,255,0.05); text-align: center;">
                        <p style="color: #888; margin-bottom: 1.5rem; font-size: 0.9rem;">Sign in to prevent impersonation and join the roast.</p>
                        <button id="login-btn" style="background: #fff; color: #000; border: none; padding: 0.8rem 2rem; font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem; letter-spacing: 0.1em; cursor: pointer;">
                            Sign in with Google
                        </button>
                    </div>
                ` : `
                    <form id="comment-form" style="background: rgba(255,255,255,0.02); padding: 2rem; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                            <span style="font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--nav-current, #fff);">Posting as ${sanitize(displayName)}</span>
                            <button id="logout-btn" type="button" style="background: transparent; border: none; color: #444; font-size: 0.6rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.1em;">Logout</button>
                        </div>
                        <div style="margin-bottom: 1.5rem;">
                            <textarea id="comment-content" maxlength="500" required placeholder="Type your roast..." style="width: 100%; background: #000; border: 1px solid #222; padding: 0.8rem; color: #fff; font-family: inherit; outline: none; min-height: 100px; resize: vertical;"></textarea>
                        </div>
                        <button type="submit" id="submit-btn" style="background: var(--nav-current, #fff); color: #000; border: none; padding: 0.8rem 2rem; font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem; letter-spacing: 0.1em; cursor: pointer;">Post Comment</button>
                    </form>
                `}
            </div>

            <div id="comments-list" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <p style="color: #444; font-size: 0.9rem; letter-spacing: 0.1em;">Checking the archives...</p>
            </div>
        </section>
    `;

    // Attach Events
    if (!user) {
        document.getElementById('login-btn').addEventListener('click', () => {
            _supabase.auth.signInWithOAuth({ provider: 'google' });
        });
    } else {
        document.getElementById('logout-btn').addEventListener('click', () => _supabase.auth.signOut());
        document.getElementById('comment-form').addEventListener('submit', (e) => handlePostComment(e, user));
    }
}

async function loadComments(profileId) {
    const { data, error } = await _supabase
        .from('comments')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });

    const list = document.getElementById('comments-list');
    if (!list) return;

    if (error) {
        list.innerText = "Failed to load comments.";
        return;
    }

    if (data.length === 0) {
        list.innerHTML = `<p style="color: #333; font-style: italic; font-size: 0.9rem;">The files are empty. For now.</p>`;
        return;
    }

    list.innerHTML = data.map(c => `
        <div style="padding: 1.5rem; border-left: 2px solid var(--nav-current, #444); background: rgba(255,255,255,0.01);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; color: var(--nav-current, #fff); letter-spacing: 0.05em;">${sanitize(c.author)}</span>
                <span style="font-size: 0.6rem; color: #333; letter-spacing: 0.1em;">${new Date(c.created_at).toLocaleDateString()}</span>
            </div>
            <p style="font-size: 0.95rem; line-height: 1.6; color: #888;">${sanitize(c.content)}</p>
        </div>
    `).join('');
}

async function handlePostComment(e, user) {
    e.preventDefault();
    const profileId = window.location.pathname.split('/').filter(Boolean).pop() || 'home';
    const content = document.getElementById('comment-content').value;
    const submitBtn = document.getElementById('submit-btn');

    const author = user?.user_metadata?.full_name || user?.email || 'User';

    submitBtn.disabled = true;
    submitBtn.innerText = 'Posting...';

    const { error } = await _supabase.from('comments').insert([{
        profile_id: profileId,
        author: author,
        content: sanitize(content),
        user_id: user.id
    }]);

    if (error) {
        alert("Error: " + error.message);
    } else {
        document.getElementById('comment-content').value = '';
        loadComments(profileId);
    }

    submitBtn.disabled = false;
    submitBtn.innerText = 'Post Comment';
}
