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
        <section class="comments-section" style="max-width: 900px; margin: 0 auto; padding: 6rem 2rem; border-top: 1px solid rgba(255,255,255,0.05);">
            <p class="section-tag">05 — Community</p>
            <h2 style="font-family: 'Bebas Neue', sans-serif; font-size: clamp(3rem, 8vw, 5.5rem); line-height: 1; margin-bottom: 2rem;">The Feedback<br>Loop</h2>
            
            <div id="auth-area" style="margin-bottom: 3rem;">
                <form id="comment-form" style="background: rgba(255,255,255,0.02); padding: 2.5rem; border: 1px solid rgba(255,255,255,0.05);">
                    ${user ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                            <span style="font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--nav-current, #fff);">Posting as ${sanitize(displayName)}</span>
                            <button id="logout-btn" type="button" style="background: transparent; border: none; color: #444; font-size: 0.6rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.1em;">Logout</button>
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                                <span style="font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: #888;">Posting as Guest</span>
                                <button id="login-btn" type="button" style="background: #fff; color: #000; border: none; padding: 0.5rem 1.2rem; font-family: 'Bebas Neue', sans-serif; font-size: 0.9rem; letter-spacing: 0.1em; cursor: pointer; transition: opacity 0.2s;">
                                    Sign in with Google
                                </button>
                            </div>
                            <input type="text" id="guest-name" placeholder="Your Name" required style="width: 100%; background: #000; border: 1px solid #222; padding: 1rem; color: #fff; font-family: inherit; outline: none; transition: border-color 0.2s;">
                        </div>
                    `}
                    <div style="margin-bottom: 1.5rem;">
                        <textarea id="comment-content" maxlength="500" required placeholder="Type your roast..." style="width: 100%; background: #000; border: 1px solid #222; padding: 1rem; color: #fff; font-family: inherit; outline: none; min-height: 120px; resize: vertical; transition: border-color 0.2s;"></textarea>
                    </div>
                    <button type="submit" id="submit-btn" style="background: var(--nav-current, #fff); color: #000; border: none; padding: 1rem 2.5rem; font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; letter-spacing: 0.1em; cursor: pointer; transition: opacity 0.2s;">Post Comment</button>
                </form>
            </div>

            <div id="comments-list" style="display: flex; flex-direction: column; gap: 2rem;">
                <p style="color: #444; font-size: 0.9rem; letter-spacing: 0.1em;">Checking the archives...</p>
            </div>
        </section>
    `;

    // Attach Events
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            _supabase.auth.signInWithOAuth({ 
                provider: 'google',
                options: {
                    redirectTo: window.location.href
                }
            });
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => _supabase.auth.signOut());
    }

    const commentForm = document.getElementById('comment-form');
    if (commentForm) {
        commentForm.addEventListener('submit', (e) => handlePostComment(e, user));
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

    list.innerHTML = data.map(c => {
        const isVerified = !!c.user_id;
        const badge = isVerified 
            ? `<span style="font-size: 0.6rem; margin-left: 0.6rem; padding: 0.15rem 0.5rem; border: 1px solid var(--nav-current, #fff); color: var(--nav-current, #fff); vertical-align: middle; letter-spacing: 0.1em;">VERIFIED ✓</span>`
            : `<span style="font-size: 0.6rem; margin-left: 0.6rem; padding: 0.15rem 0.5rem; border: 1px solid #444; color: #444; vertical-align: middle; letter-spacing: 0.1em;">UNVERIFIED</span>`;

        return `
            <div style="padding: 1.5rem; border-left: 2px solid var(--nav-current, #444); background: rgba(255,255,255,0.01);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div style="display: flex; align-items: center;">
                        <span style="font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; color: var(--nav-current, #fff); letter-spacing: 0.05em;">${sanitize(c.author)}</span>
                        ${badge}
                    </div>
                    <span style="font-size: 0.6rem; color: #333; letter-spacing: 0.1em;">${new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p style="font-size: 0.95rem; line-height: 1.6; color: #888;">${sanitize(c.content)}</p>
            </div>
        `;
    }).join('');
}

async function handlePostComment(e, user) {
    e.preventDefault();
    const profileId = window.location.pathname.split('/').filter(Boolean).pop() || 'home';
    const content = document.getElementById('comment-content').value;
    const submitBtn = document.getElementById('submit-btn');

    let author;
    if (user) {
        author = user?.user_metadata?.full_name || user?.email || 'User';
    } else {
        author = document.getElementById('guest-name')?.value || 'Guest';
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Posting...';

    const { error } = await _supabase.from('comments').insert([{
        profile_id: profileId,
        author: author,
        content: sanitize(content),
        user_id: user?.id || null
    }]);

    if (error) {
        alert("Error: " + error.message);
    } else {
        document.getElementById('comment-content').value = '';
        const guestNameInput = document.getElementById('guest-name');
        if (guestNameInput) guestNameInput.value = '';
        loadComments(profileId);
    }

    submitBtn.disabled = false;
    submitBtn.innerText = 'Post Comment';
}
