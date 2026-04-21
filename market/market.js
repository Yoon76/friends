// Supabase Configuration
const SUPABASE_URL = 'https://sqbdiniogmxxwolckozp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qq32D3lzkUOGvc_5HaZMiQ_1lnmiZOZ';
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Market State
let currentUser = null;
let currentName = 'Anonymous Trader';

// Starting Portfolio
let portfolio = {
    cash: 1000.00,
    holdings: {} // e.g., { 'AMR': 10 }
};

// The 15 Friends as Stocks
const STOCKS = [
    { id: 'amr', ticker: 'AMR', name: 'Amr', price: 100, volatility: 0.02 },
    { id: 'ayaron', ticker: 'AYRN', name: 'AyAron', price: 150, volatility: 0.05 },
    { id: 'jasper', ticker: 'JSPR', name: 'Jasper', price: 50, volatility: 0.15 },
    { id: 'max', ticker: 'MAX', name: 'Max', price: 120, volatility: 0.03 },
    { id: 'sagan', ticker: 'SGN', name: 'Sagan', price: 80, volatility: 0.08 },
    { id: 't-bone', ticker: 'TBN', name: 'T-Bone', price: 90, volatility: 0.06 },
    { id: 'ahmed', ticker: 'AHMD', name: 'Ahmed', price: 200, volatility: 0.04 },
    { id: 'latham', ticker: 'LTHM', name: 'Latham', price: 40, volatility: 0.12 },
    { id: 'dev', ticker: 'DEV', name: 'Dev', price: 65, volatility: 0.10 },
    { id: 'tj', ticker: 'TJ', name: 'TJ', price: 46, volatility: 0.14 },
    { id: 'mac', ticker: 'MAC', name: 'Mac', price: 250, volatility: 0.03 },
    { id: 'preston', ticker: 'PRST', name: 'Preston', price: 300, volatility: 0.05 },
    { id: 'li-mills', ticker: 'LI', name: 'Li Mills', price: 75, volatility: 0.18 },
    { id: 'javier', ticker: 'JVR', name: 'Javier', price: 110, volatility: 0.07 },
    { id: 'sam-bradih', ticker: 'SAM', name: 'Sam Bradley', price: 180, volatility: 0.06 }
];

// Current Prices Map
let marketPrices = {};
let previousPrices = {};
STOCKS.forEach(s => {
    marketPrices[s.ticker] = s.price;
    previousPrices[s.ticker] = s.price;
    portfolio.holdings[s.ticker] = 0; // Init holdings to 0
});

// Lore News Events
const NEWS_EVENTS = [
    { text: "BREAKING: Li Mills and AyAron just double-fumbled the same girl.", impacts: { 'LI': -0.4, 'AYRN': -0.3 } },
    { text: "BREAKING: Mac just hit a 500-day Duolingo streak. Owl pleased.", impacts: { 'MAC': 0.25 } },
    { text: "BREAKING: Preston caught searching for bomb instructions. FBI en route.", impacts: { 'PRST': -0.6 } },
    { text: "BREAKING: Sam Bradley claims 3 sets of ankles on the court.", impacts: { 'SAM': 0.4 } },
    { text: "BREAKING: Javier finds proof of Agartha in a White Monster can.", impacts: { 'JVR': 0.35 } },
    { text: "BREAKING: Ahmed spotted within 10 feet of a sophomore.", impacts: { 'AHMD': 0.15 } },
    { text: "BREAKING: Jasper caught lying about being 5'5\".", impacts: { 'JSPR': -0.3 } },
    { text: "BREAKING: Dev gets a 65 on his Calc test. Confidence remains 100%.", impacts: { 'DEV': -0.2 } },
    { text: "BREAKING: TJ tries to act tuff. Nobody is intimidated.", impacts: { 'TJ': -0.25 } },
    { text: "BREAKING: Mrs. Wiltcher yells at Latham for talking.", impacts: { 'LTHM': -0.4 } },
    { text: "BREAKING: Amr remains completely nonchalant during a fire drill.", impacts: { 'AMR': 0.1 } },
    { text: "BREAKING: T-Bone makes Mrs. Jones sigh heavily.", impacts: { 'TBN': 0.15 } },
    { text: "BREAKING: Sagan gets mogged. Again.", impacts: { 'SGN': -0.15 } },
    { text: "BREAKING: Max self-reports an incident.", impacts: { 'MAX': -0.1 } },
    { text: "BREAKING: Preston mogs someone clavicular. Devastating.", impacts: { 'PRST': 0.3 } }
];

// Initialization
async function init() {
    // Auth Check
    let { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        document.getElementById('market-login-btn').addEventListener('click', () => {
            _supabase.auth.signInWithOAuth({ 
                provider: 'google',
                options: { redirectTo: window.location.href }
            });
        });
        return; // Stop here, wait for login
    }

    // Logged in
    document.getElementById('auth-wall').style.display = 'none';
    document.getElementById('market-dashboard').style.display = 'grid';
    
    currentUser = session.user;
    currentName = userDisplayName(currentUser);

    // Load or Init Portfolio from LocalStorage (simple persistence)
    const savedData = localStorage.getItem(`beef_portfolio_${currentUser.id}`);
    if (savedData) {
        const parsed = JSON.parse(savedData);
        portfolio.cash = parsed.cash;
        portfolio.holdings = parsed.holdings || portfolio.holdings;
    }

    // Start Game Loops
    renderMarket();
    renderPortfolio();
    startMarketSimulation();
    
    // Initial Sync & Realtime Setup
    syncNetWorth();
    fetchLeaderboard();

    setInterval(syncNetWorth, 10000); // Sync to DB every 10s
    
    _supabase
        .channel('public:market_players')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'market_players' }, () => {
            fetchLeaderboard();
        })
        .subscribe();
}

function userDisplayName(user) {
    if (!user) return 'Guest';
    return user.user_metadata?.full_name || user.email || 'Trader';
}

// Market Loop
function startMarketSimulation() {
    // Regular Price Fluctuations (Every 3 seconds)
    setInterval(() => {
        STOCKS.forEach(s => {
            previousPrices[s.ticker] = marketPrices[s.ticker];
            // Random walk based on volatility
            const change = 1 + ((Math.random() * 2 - 1) * s.volatility);
            marketPrices[s.ticker] = Math.max(1, marketPrices[s.ticker] * change); // Floor at $1
        });
        renderMarket();
        renderPortfolio();
    }, 3000);

    // News Events (Every 15-20 seconds)
    setInterval(() => {
        const event = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
        
        // Show Marquee
        const marquee = document.getElementById('news-marquee');
        marquee.innerText = event.text;

        // Apply Impacts
        for (const [ticker, impact] of Object.entries(event.impacts)) {
            previousPrices[ticker] = marketPrices[ticker];
            marketPrices[ticker] = Math.max(1, marketPrices[ticker] * (1 + impact));
        }

        renderMarket();
        renderPortfolio();
    }, 18000);
}

// Rendering
function renderMarket() {
    const list = document.getElementById('stock-list');
    list.innerHTML = STOCKS.map(s => {
        const current = marketPrices[s.ticker];
        const prev = previousPrices[s.ticker];
        const isUp = current >= prev;
        const changeClass = isUp ? 'up' : 'down';
        const changeSymbol = isUp ? '▲' : '▼';
        
        return `
            <div class="stock-row">
                <div>
                    <div class="stock-name">${s.name}</div>
                    <div class="stock-ticker">$${s.ticker}</div>
                </div>
                <div class="stock-price">$${current.toFixed(2)}</div>
                <div class="stock-change ${changeClass}">${changeSymbol} ${Math.abs(((current - prev)/prev)*100).toFixed(1)}%</div>
                <div class="actions">
                    <button class="btn btn-sell" onclick="sell('${s.ticker}')" ${portfolio.holdings[s.ticker] <= 0 ? 'disabled' : ''}>SELL</button>
                    <button class="btn btn-buy" onclick="buy('${s.ticker}')" ${portfolio.cash < current ? 'disabled' : ''}>BUY</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderPortfolio() {
    let netWorth = portfolio.cash;
    let holdingsHtml = '';

    STOCKS.forEach(s => {
        const qty = portfolio.holdings[s.ticker] || 0;
        if (qty > 0) {
            const value = qty * marketPrices[s.ticker];
            netWorth += value;
            holdingsHtml += `
                <div class="holding-item">
                    <span>${qty}x $${s.ticker}</span>
                    <span>$${value.toFixed(2)}</span>
                </div>
            `;
        }
    });

    document.getElementById('net-worth-display').innerText = `$${netWorth.toFixed(2)}`;
    document.getElementById('cash-display').innerText = `Liquid Cash: $${portfolio.cash.toFixed(2)}`;
    
    if (holdingsHtml === '') {
        document.getElementById('holdings-list').innerHTML = '<div style="color: #444;">No open positions.</div>';
    } else {
        document.getElementById('holdings-list').innerHTML = holdingsHtml;
    }

    // Save to local storage
    if (currentUser) {
        localStorage.setItem(`beef_portfolio_${currentUser.id}`, JSON.stringify(portfolio));
    }
}

// Trading Actions
window.buy = function(ticker) {
    const price = marketPrices[ticker];
    if (portfolio.cash >= price) {
        portfolio.cash -= price;
        portfolio.holdings[ticker] = (portfolio.holdings[ticker] || 0) + 1;
        renderMarket();
        renderPortfolio();
    }
};

window.sell = function(ticker) {
    const price = marketPrices[ticker];
    if (portfolio.holdings[ticker] > 0) {
        portfolio.holdings[ticker] -= 1;
        portfolio.cash += price;
        renderMarket();
        renderPortfolio();
    }
};

// Leaderboard Sync
async function syncNetWorth() {
    if (!currentUser) return;
    
    let netWorth = portfolio.cash;
    STOCKS.forEach(s => {
        const qty = portfolio.holdings[s.ticker] || 0;
        netWorth += qty * marketPrices[s.ticker];
    });

    await _supabase.from('market_players').upsert({
        id: currentUser.id,
        name: currentName,
        net_worth: netWorth,
        updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
}

async function fetchLeaderboard() {
    const { data, error } = await _supabase
        .from('market_players')
        .select('name, net_worth')
        .order('net_worth', { ascending: false })
        .limit(10);

    if (error || !data) return;

    const lbList = document.getElementById('market-leaderboard');
    lbList.innerHTML = data.map((player, index) => {
        return `
            <div class="lb-row ${index === 0 ? 'top' : ''}">
                <span>#${index + 1} ${player.name}</span>
                <span style="color: var(--green); font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem;">
                    $${parseFloat(player.net_worth).toFixed(2)}
                </span>
            </div>
        `;
    }).join('');
}

document.addEventListener('DOMContentLoaded', init);
