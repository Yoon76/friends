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

async function initForum() {
    const authArea = document.getElementById('auth-area');
    const threadsList = document.getElementById('threads-list');

    // Check current session
    let { data: { session } } = await _supabase.auth.getSession();

    renderAuthArea(authArea, session);
    loadThreads();

    // Listen for auth changes
    _supabase.auth.onAuthStateChange((_event, session) => {
        renderAuthArea(authArea, session);
        loadThreads();
    });
}

function renderAuthArea(container, session) {
    const user = session?.user;
    const displayName = user?.user_metadata?.full_name || user?.email || 'Authenticated User';

    if (!user) {
        container.innerHTML = `
            <div class="login-wall">
                <p>Sign in with Google to start a new thread and join the archive.</p>
                <button id="login-btn" class="btn">Sign in with Google</button>
            </div>
        `;
        document.getElementById('login-btn').addEventListener('click', () => {
            _supabase.auth.signInWithOAuth({ 
                provider: 'google',
                options: {
                    redirectTo: window.location.href
                }
            });
        });
    } else {
        container.innerHTML = `
            <form id="thread-form" style="background: rgba(255,255,255,0.02); padding: 3rem; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <span style="font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent);">New Thread as ${sanitize(displayName)}</span>
                    <button id="logout-btn" type="button">Logout</button>
                </div>
                
                <div class="form-group">
                    <label>Thread Title</label>
                    <input type="text" id="thread-title" required placeholder="What's on your mind?" maxlength="100">
                </div>

                <div class="form-group">
                    <label>Content</label>
                    <textarea id="thread-content" required placeholder="Explain yourself..." style="min-height: 150px; resize: vertical;" maxlength="2000"></textarea>
                </div>

                <button type="submit" id="submit-btn" class="btn">Create Thread</button>
            </form>
        `;
        document.getElementById('logout-btn').addEventListener('click', () => _supabase.auth.signOut());
        document.getElementById('thread-form').addEventListener('submit', (e) => handleCreateThread(e, user));
    }
}

async function loadThreads() {
    const list = document.getElementById('threads-list');
    
    const { data, error } = await _supabase
        .from('threads')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        list.innerHTML = `<p style="color: #633; font-size: 0.9rem;">Failed to retrieve archives. Check connection.</p>`;
        return;
    }

    if (data.length === 0) {
        list.innerHTML = `<p style="color: #333; font-style: italic; font-size: 0.9rem; text-align: center; padding: 4rem;">The board is silent. Too silent.</p>`;
        return;
    }

    list.innerHTML = data.map(t => `
        <div class="thread-card">
            <div class="thread-meta">
                <span class="thread-author">${sanitize(t.author)}</span>
                <span class="thread-date">${new Date(t.created_at).toLocaleDateString()}</span>
            </div>
            <h2 class="thread-title">${sanitize(t.title)}</h2>
            <p class="thread-preview">${sanitize(t.content)}</p>
        </div>
    `).join('');
}

async function handleCreateThread(e, user) {
    e.preventDefault();
    const title = document.getElementById('thread-title').value;
    const content = document.getElementById('thread-content').value;
    const submitBtn = document.getElementById('submit-btn');

    const author = user?.user_metadata?.full_name || user?.email || 'User';

    submitBtn.disabled = true;
    submitBtn.innerText = 'Archiving...';

    const { error } = await _supabase.from('threads').insert([{
        title: sanitize(title),
        author: author,
        content: sanitize(content),
        user_id: user.id
    }]);

    if (error) {
        alert("Error: " + error.message);
        submitBtn.disabled = false;
        submitBtn.innerText = 'Create Thread';
    } else {
        document.getElementById('thread-title').value = '';
        document.getElementById('thread-content').value = '';
        loadThreads();
        submitBtn.disabled = false;
        submitBtn.innerText = 'Create Thread';
    }
}

document.addEventListener('DOMContentLoaded', initForum);
