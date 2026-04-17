// Supabase Configuration
const SUPABASE_URL = 'https://sqbdiniogmxxwolckozp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qq32D3lzkUOGvc_5HaZMiQ_1lnmiZOZ';

// Initialize Supabase Client (using CDN version)
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function initComments(profileId) {
    const container = document.getElementById('comments-container');
    if (!container) return;

    // Create HTML Structure
    container.innerHTML = `
        <section class="comments-section" style="padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4rem;">
            <p class="section-tag">05 — Community</p>
            <h2 style="margin-bottom: 2rem;">The Feedback<br>Loop</h2>
            
            <form id="comment-form" style="background: rgba(255,255,255,0.02); padding: 2rem; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 3rem;">
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem;">Your Name</label>
                    <input type="text" id="comment-author" required style="width: 100%; background: #000; border: 1px solid #222; padding: 0.8rem; color: #fff; font-family: inherit; outline: none; transition: border-color 0.2s;">
                </div>
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem;">Comment</label>
                    <textarea id="comment-content" required style="width: 100%; background: #000; border: 1px solid #222; padding: 0.8rem; color: #fff; font-family: inherit; outline: none; min-height: 100px; resize: vertical; transition: border-color 0.2s;"></textarea>
                </div>
                <button type="submit" id="submit-btn" style="background: var(--nav-current, #fff); color: #000; border: none; padding: 0.8rem 2rem; font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem; letter-spacing: 0.1em; cursor: pointer; transition: opacity 0.2s;">Post Comment</button>
            </form>

            <div id="comments-list" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <p style="color: #444; font-size: 0.9rem; letter-spacing: 0.1em;">Loading comments...</p>
            </div>
        </section>
    `;

    const form = document.getElementById('comment-form');
    const commentsList = document.getElementById('comments-list');
    const submitBtn = document.getElementById('submit-btn');

    // Load Comments
    async function loadComments() {
        const { data, error } = await _supabase
            .from('comments')
            .select('*')
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false });

        if (error) {
            commentsList.innerHTML = `<p style="color: #662222;">Error loading comments: ${error.message}</p>`;
            return;
        }

        if (data.length === 0) {
            commentsList.innerHTML = `<p style="color: #333; font-style: italic; font-size: 0.9rem;">No comments yet. Be the first to roast.</p>`;
            return;
        }

        commentsList.innerHTML = data.map(c => `
            <div style="padding: 1.5rem; border-left: 2px solid var(--nav-current, #444); background: rgba(255,255,255,0.01);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; color: var(--nav-current, #fff); letter-spacing: 0.05em;">${escapeHtml(c.author)}</span>
                    <span style="font-size: 0.6rem; color: #333; letter-spacing: 0.1em;">${new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p style="font-size: 0.95rem; line-height: 1.6; color: #888;">${escapeHtml(c.content)}</p>
            </div>
        `).join('');
    }

    // Handle Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const author = document.getElementById('comment-author').value;
        const content = document.getElementById('comment-content').value;

        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.innerText = 'Posting...';

        const { error } = await _supabase
            .from('comments')
            .insert([{ profile_id: profileId, author, content }]);

        if (error) {
            alert('Error posting comment: ' + error.message);
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

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
