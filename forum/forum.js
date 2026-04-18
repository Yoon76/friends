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

function getBadge(userId) {
    return userId 
        ? `<span class="badge verified">VERIFIED ✓</span>`
        : `<span class="badge unverified">UNVERIFIED</span>`;
}

async function initForum() {
    const urlParams = new URLSearchParams(window.location.search);
    const threadId = urlParams.get('id');

    // Check current session
    let { data: { session } } = await _supabase.auth.getSession();

    if (threadId) {
        viewThread(threadId, session);
    } else {
        listThreads(session);
    }

    // Listen for auth changes
    _supabase.auth.onAuthStateChange((_event, session) => {
        const currentParams = new URLSearchParams(window.location.search);
        const currentThreadId = currentParams.get('id');
        if (currentThreadId) {
            viewThread(currentThreadId, session);
        } else {
            listThreads(session);
        }
    });
}

function renderAuthArea(container, session, isReply = false, threadId = null) {
    const user = session?.user;
    const displayName = user?.user_metadata?.full_name || user?.email || 'Authenticated User';
    const formId = isReply ? 'reply-form' : 'thread-form';
    const submitBtnId = isReply ? 'reply-submit-btn' : 'submit-btn';
    const titleText = isReply ? `Replying as ${user ? sanitize(displayName) : 'Guest'}` : `New Thread as ${user ? sanitize(displayName) : 'Guest'}`;

    container.innerHTML = `
        <form id="${formId}" style="background: rgba(255,255,255,0.02); padding: 3rem; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
                <span style="font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent);">${titleText}</span>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    ${user 
                        ? `<button id="logout-btn" type="button" class="btn" style="padding: 0.5rem 1rem; font-size: 0.8rem;">Logout</button>` 
                        : `<button id="login-btn" type="button" class="btn" style="padding: 0.5rem 1rem; font-size: 0.8rem;">Login with Google</button>`
                    }
                </div>
            </div>
            
            ${!user ? `
                <div class="form-group">
                    <label>Your Name</label>
                    <input type="text" id="guest-name" required placeholder="Who are you?" maxlength="50">
                </div>
            ` : ''}

            ${!isReply ? `
                <div class="form-group">
                    <label>Thread Title</label>
                    <input type="text" id="thread-title" required placeholder="What's on your mind?" maxlength="100">
                </div>
            ` : ''}

            <div class="form-group">
                <label>${isReply ? 'Your Reply' : 'Content'}</label>
                <textarea id="${isReply ? 'reply-content' : 'thread-content'}" required placeholder="${isReply ? 'Say something...' : 'Explain yourself...'}" style="min-height: 150px; resize: vertical;" maxlength="2000"></textarea>
            </div>

            <button type="submit" id="${submitBtnId}" class="btn">${isReply ? 'Post Reply' : 'Create Thread'}</button>
        </form>
    `;

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            _supabase.auth.signInWithOAuth({ 
                provider: 'google',
                options: { redirectTo: window.location.href }
            });
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => _supabase.auth.signOut());
    }

    const form = document.getElementById(formId);
    if (isReply) {
        form.addEventListener('submit', (e) => handlePostReply(e, user, threadId));
    } else {
        form.addEventListener('submit', (e) => handleCreateThread(e, user));
    }
}

async function listThreads(session) {
    document.getElementById('list-view').classList.remove('view-hidden');
    document.getElementById('thread-view').classList.add('view-hidden');
    
    const authArea = document.getElementById('auth-area');
    renderAuthArea(authArea, session);

    const list = document.getElementById('threads-list');
    
    const { data, error } = await _supabase
        .from('threads')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        list.innerHTML = `<p style="color: #633; font-size: 0.9rem;">Failed to retrieve archives.</p>`;
        return;
    }

    if (data.length === 0) {
        list.innerHTML = `<p style="color: #333; font-style: italic; font-size: 0.9rem; text-align: center; padding: 4rem;">The board is silent.</p>`;
        return;
    }

    list.innerHTML = data.map(t => `
        <div class="thread-card" onclick="window.location.search = '?id=${t.id}'">
            <div class="thread-meta">
                <div class="author-wrapper">
                    <span class="thread-author">${sanitize(t.author)}</span>
                    ${getBadge(t.user_id)}
                </div>
                <span class="thread-date">${new Date(t.created_at).toLocaleDateString()}</span>
            </div>
            <h2 class="thread-title">${sanitize(t.title)}</h2>
            <p class="thread-content thread-preview">${sanitize(t.content)}</p>
        </div>
    `).join('');
}

async function viewThread(threadId, session) {
    document.getElementById('list-view').classList.add('view-hidden');
    document.getElementById('thread-view').classList.remove('view-hidden');

    const activeThreadContainer = document.getElementById('active-thread');
    const repliesList = document.getElementById('replies-list');
    const replyAuthArea = document.getElementById('reply-auth-area');

    renderAuthArea(replyAuthArea, session, true, threadId);

    // Fetch thread
    const { data: thread, error: threadError } = await _supabase
        .from('threads')
        .select('*')
        .eq('id', threadId)
        .single();

    if (threadError || !thread) {
        activeThreadContainer.innerHTML = `<p style="color: #633;">Thread not found.</p>`;
        return;
    }

    activeThreadContainer.innerHTML = `
        <div class="thread-detail">
            <div class="thread-meta">
                <div class="author-wrapper">
                    <span class="thread-author" style="font-size: 1.5rem;">${sanitize(thread.author)}</span>
                    ${getBadge(thread.user_id)}
                </div>
                <span class="thread-date">${new Date(thread.created_at).toLocaleString()}</span>
            </div>
            <h1 class="thread-title" style="font-size: clamp(3rem, 8vw, 6rem);">${sanitize(thread.title)}</h1>
            <p class="thread-content" style="font-size: 1.2rem; color: #ccc;">${sanitize(thread.content).replace(/\n/g, '<br>')}</p>
        </div>
    `;

    // Fetch replies
    const { data: replies, error: repliesError } = await _supabase
        .from('replies')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

    if (repliesError) {
        repliesList.innerHTML = `<p style="color: #633;">Failed to load replies.</p>`;
        return;
    }

    if (replies.length === 0) {
        repliesList.innerHTML = `<p style="color: #333; font-style: italic; padding: 2rem;">No replies yet. Be the first to speak.</p>`;
    } else {
        repliesList.innerHTML = `<p class="section-tag" style="margin-bottom: 2rem;">${replies.length} Replies</p>` + 
        replies.map(r => `
            <div class="reply-card">
                <div class="reply-meta">
                    <div class="author-wrapper">
                        <span class="reply-author">${sanitize(r.author)}</span>
                        ${getBadge(r.user_id)}
                    </div>
                    <span class="reply-date">${new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p class="reply-content">${sanitize(r.content).replace(/\n/g, '<br>')}</p>
            </div>
        `).join('');
    }
}

async function handleCreateThread(e, user) {
    e.preventDefault();
    const title = document.getElementById('thread-title').value;
    const content = document.getElementById('thread-content').value;
    const submitBtn = document.getElementById('submit-btn');

    let author;
    if (user) {
        author = user?.user_metadata?.full_name || user?.email || 'User';
    } else {
        author = document.getElementById('guest-name')?.value || 'Guest';
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Archiving...';

    const { error } = await _supabase.from('threads').insert([{
        title: sanitize(title),
        author: author,
        content: sanitize(content),
        user_id: user?.id || null
    }]);

    if (error) {
        alert("Error: " + error.message);
        submitBtn.disabled = false;
        submitBtn.innerText = 'Create Thread';
    } else {
        window.location.reload();
    }
}

async function handlePostReply(e, user, threadId) {
    e.preventDefault();
    const content = document.getElementById('reply-content').value;
    const submitBtn = document.getElementById('reply-submit-btn');

    let author;
    if (user) {
        author = user?.user_metadata?.full_name || user?.email || 'User';
    } else {
        author = document.getElementById('guest-name')?.value || 'Guest';
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Replying...';

    const { error } = await _supabase.from('replies').insert([{
        thread_id: threadId,
        author: author,
        content: sanitize(content),
        user_id: user?.id || null
    }]);

    if (error) {
        alert("Error: " + error.message);
        submitBtn.disabled = false;
        submitBtn.innerText = 'Post Reply';
    } else {
        document.getElementById('reply-content').value = '';
        const guestNameInput = document.getElementById('guest-name');
        if (guestNameInput) guestNameInput.value = '';
        viewThread(threadId, { user: user }); // Refresh view
    }
}

document.addEventListener('DOMContentLoaded', initForum);
