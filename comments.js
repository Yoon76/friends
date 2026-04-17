// Supabase Configuration
const SUPABASE_URL = 'https://sqbdiniogmxxwolckozp.supabase.co';
// This is a PUBLISHABLE key, designed to be public. 
// Security is enforced via Supabase Row Level Security (RLS) policies.
const SUPABASE_KEY = 'sb_publishable_Qq32D3lzkUOGvc_5HaZMiQ_1lnmiZOZ';

// Initialize Supabase Client
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Sanitizes strings to prevent XSS attacks.
 * Converts sensitive characters to their HTML-safe entities.
 */
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

    // Use a DocumentFragment or separate elements to avoid direct innerHTML on raw user data
    container.innerHTML = `
        <section class="comments-section" style="padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4rem;">
            <p class="section-tag">05 — Community</p>
            <h2 style="margin-bottom: 2rem;">The Feedback<br>Loop</h2>
            
            <form id="comment-form" style="background: rgba(255,255,255,0.02); padding: 2rem; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 3rem;">
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem;">Your Name</label>
                    <input type="text" id="comment-author" maxlength="50" required placeholder="Display Name" style="width: 100%; background: #000; border: 1px solid #222; padding: 0.8rem; color: #fff; font-family: inherit; outline: none; transition: border-color 0.2s;">
                </div>
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem;">Comment</label>
                    <textarea id="comment-content" maxlength="500" required placeholder="Type your roast..." style="width: 100%; background: #000; border: 1px solid #222; padding: 0.8rem; color: #fff; font-family: inherit; outline: none; min-height: 100px; resize: vertical; transition: border-color 0.2s;"></textarea>
                </div>
                <button type="submit" id="submit-btn" style="background: var(--nav-current, #fff); color: #000; border: none; padding: 0.8rem 2rem; font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem; letter-spacing: 0.1em; cursor: pointer; transition: opacity 0.2s;">Post Comment</button>
            </form>

            <div id="comments-list" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <p style="color: #444; font-size: 0.9rem; letter-spacing: 0.1em;">Checking for feedback...</p>
            </div>
        </section>
    `;

    const form = document.getElementById('comment-form');
    const commentsList = document.getElementById('comments-list');
    const submitBtn = document.getElementById('submit-btn');

    // Load Comments
    async function loadComments() {
        // Supabase client uses parameterized requests by default, preventing SQL Injection
        const { data, error } = await _supabase
            .from('comments')
            .select('*')
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false });

        if (error) {
            commentsList.innerText = `Error loading comments: ${error.message}`;
            return;
        }

        if (data.length === 0) {
            commentsList.innerHTML = `<p style="color: #333; font-style: italic; font-size: 0.9rem;">No comments yet. Be the first to roast.</p>`;
            return;
        }

        // Render comments safely by pre-sanitizing data
        commentsList.innerHTML = data.map(c => {
            const safeAuthor = sanitize(c.author);
            const safeContent = sanitize(c.content);
            const safeDate = new Date(c.created_at).toLocaleDateString();
            
            return `
                <div style="padding: 1.5rem; border-left: 2px solid var(--nav-current, #444); background: rgba(255,255,255,0.01);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <span style="font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; color: var(--nav-current, #fff); letter-spacing: 0.05em;">${safeAuthor}</span>
                        <span style="font-size: 0.6rem; color: #333; letter-spacing: 0.1em;">${safeDate}</span>
                    </div>
                    <p style="font-size: 0.95rem; line-height: 1.6; color: #888;">${safeContent}</p>
                </div>
            `;
        }).join('');
    }

    // Handle Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Input validation & Sanitization
        const rawAuthor = document.getElementById('comment-author').value;
        const rawContent = document.getElementById('comment-content').value;
        
        const author = sanitize(rawAuthor);
        const content = sanitize(rawContent);

        if (!author || !content) return;

        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.innerText = 'Posting...';

        // Parameterized insert
        const { error } = await _supabase
            .from('comments')
            .insert([{ 
                profile_id: profileId, 
                author, 
                content 
            }]);

        if (error) {
            console.error('Security/Database Error:', error.message);
            alert('Failed to post. Check connection.');
        } else {
            form.reset();
            loadComments();
        }

        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.innerText = 'Post Comment';
    });

    loadComments();
}
