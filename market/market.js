// Supabase Configuration
const SUPABASE_URL = 'https://sqbdiniogmxxwolckozp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qq32D3lzkUOGvc_5HaZMiQ_1lnmiZOZ';
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sanitize(str) {
    if (!str) return '';
    const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', "/": '&#x2F;'};
    return String(str).replace(/[&<>"'/]/ig, m => map[m]).trim();
}

let currentUser = null;
let currentName = 'Anonymous Trader';

let portfolio = {
    cash: 1000.00,
    holdings: {}
};

// Core Assets (drastic changes, low frequency)
const STOCKS = [
    { ticker: 'AMR', name: 'Amr', price: 100, vol: 0.15, color: '#ff4757' },
    { ticker: 'AYRN', name: 'AyAron', price: 150, vol: 0.10, color: '#2ed573' },
    { ticker: 'JSPR', name: 'Jasper', price: 50, vol: 0.35, color: '#1e90ff' }, // High vol bum
    { ticker: 'MAX', name: 'Max', price: 120, vol: 0.12, color: '#ffa502' },
    { ticker: 'SGN', name: 'Sagan', price: 80, vol: 0.20, color: '#9b59b6' },
    { ticker: 'TBN', name: 'T-Bone', price: 90, vol: 0.18, color: '#1abc9c' },
    { ticker: 'AHMD', name: 'Ahmed', price: 200, vol: 0.10, color: '#ff7f50' },
    { ticker: 'LTHM', name: 'Latham', price: 40, vol: 0.30, color: '#34495e' }, // High vol bum
    { ticker: 'DEV', name: 'Dev', price: 65, vol: 0.25, color: '#ff6348' },
    { ticker: 'TJ', name: 'TJ', price: 46, vol: 0.32, color: '#7bed9f' },
    { ticker: 'MAC', name: 'Mac', price: 250, vol: 0.08, color: '#70a1ff' },
    { ticker: 'PRST', name: 'Preston', price: 300, vol: 0.15, color: '#eccc68' },
    { ticker: 'LI', name: 'Li Mills', price: 75, vol: 0.28, color: '#9c88ff' },
    { ticker: 'JVR', name: 'Javier', price: 110, vol: 0.15, color: '#d35400' },
    { ticker: 'SAM', name: 'Sam Bradley', price: 180, vol: 0.12, color: '#2ed573' }
];

const INDEX_FUNDS = [
    { ticker: 'FRSH', name: 'Freshman ETF', components: ['AHMD', 'LI'], color: '#ff4757' },
    { ticker: 'SHNGN', name: 'Shenanigan Index', components: ['LI', 'SAM'], color: '#eccc68' },
    { ticker: 'ROYAL', name: 'Clavicular Trust', components: ['PRST', 'JVR'], color: '#70a1ff' }
];

const ALL_ASSETS = [...STOCKS, ...INDEX_FUNDS];

let marketPrices = {};
let previousPrices = {};
let priceHistory = {}; 
const MAX_HISTORY = 30; // Shorter history for clearer visual impact
let currentSelectedAsset = null;

let priceChart = null;

// Deterministic PRNG
function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// O(1) Global Deterministic Market Algorithm
function computeMarketData() {
    const now = Date.now();
    const TICK_INTERVAL = 10000; // 10 seconds -> 6 updates per minute
    const startOfTime = 1700000000000; // Arbitrary global epoch
    
    const currentTick = Math.floor((now - startOfTime) / TICK_INTERVAL);
    const startTick = currentTick - MAX_HISTORY;
    
    let currentP = {};
    let prevP = {};
    let hist = {};
    
    STOCKS.forEach((s, s_idx) => {
        hist[s.ticker] = [];
        
        for (let i = 0; i <= MAX_HISTORY; i++) {
            const T = startTick + i;
            const seed1 = T + s_idx * 100;
            const seed2 = T * 2 + s_idx * 200;
            
            // Base price algorithm (O(1) continuous state)
            // Long wave (trend) + Short wave (fluctuations) + PRNG noise
            const trend = Math.sin(T / 60 + s_idx) * 0.35; // +/- 35%
            const fast = Math.sin(T / 8 + s_idx * 5) * 0.15; // +/- 15%
            const noise = (seededRandom(seed1) * 2 - 1) * s.vol; // Volatility noise
            
            // Random drastic spikes (can save bums or crash gods)
            let spike = 0;
            if (seededRandom(seed2) > 0.95) {
                spike = (seededRandom(seed2 + 1) * 2 - 1) * 0.6; // up to +/- 60% massive swing
            }
            
            const totalChange = trend + fast + noise + spike;
            const tickPrice = Math.max(1, s.price * (1 + totalChange)); // Floor at $1
            
            hist[s.ticker].push(tickPrice);
            
            if (i === MAX_HISTORY - 1) prevP[s.ticker] = tickPrice;
            if (i === MAX_HISTORY) currentP[s.ticker] = tickPrice;
        }
    });

    INDEX_FUNDS.forEach(f => {
        hist[f.ticker] = [];
        for (let j = 0; j <= MAX_HISTORY; j++) {
            let sum = 0;
            f.components.forEach(c => sum += hist[c][j]);
            hist[f.ticker].push(sum / f.components.length);
        }
        currentP[f.ticker] = hist[f.ticker][MAX_HISTORY];
        prevP[f.ticker] = hist[f.ticker][MAX_HISTORY - 1] || currentP[f.ticker];
    });

    return { 
        currentP, prevP, hist, 
        nextTickMs: TICK_INTERVAL - (now % TICK_INTERVAL) 
    };
}

function triggerMarketUpdate() {
    const data = computeMarketData();
    marketPrices = data.currentP;
    previousPrices = data.prevP;
    priceHistory = data.hist;
    
    renderAssetList();
    if (currentSelectedAsset) renderMainView();
    renderPortfolio();
    updateChartData();
    
    // Schedule next exact tick
    setTimeout(triggerMarketUpdate, data.nextTickMs);
}

async function init() {
    let { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        const btn = document.getElementById('market-login-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                _supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href }});
            });
        }
        return;
    }

    document.getElementById('auth-wall').style.display = 'none';
    document.getElementById('market-dashboard').style.visibility = 'visible';
    
    currentUser = session.user;
    currentName = currentUser.user_metadata?.full_name || currentUser.email || 'Trader';

    // Load Local Data (with fallback)
    const baseKey = `beef_global_portfolio_${currentUser.id}`;
    const savedData = localStorage.getItem(baseKey) || 
                      localStorage.getItem(`beef_portfolio_v3_${currentUser.id}`) || 
                      localStorage.getItem(`beef_portfolio_${currentUser.id}`);
                      
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            portfolio.cash = parsed.cash !== undefined ? parsed.cash : 1000.00;
            portfolio.holdings = parsed.holdings || {};
        } catch (e) {}
    }

    // Initial Data Sync
    const data = computeMarketData();
    marketPrices = data.currentP;
    previousPrices = data.prevP;
    priceHistory = data.hist;

    initChart();
    renderAssetList();
    renderPortfolio();
    updateChartData();

    // Start Engine
    setTimeout(triggerMarketUpdate, data.nextTickMs);
    
    syncNetWorth();
    fetchLeaderboard();
    setInterval(syncNetWorth, 10000);
    
    _supabase.channel('public:market_players')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'market_players' }, () => {
            fetchLeaderboard();
        }).subscribe();
}

function renderAssetList() {
    const list = document.getElementById('asset-list');
    if (!list) return;
    
    list.innerHTML = ALL_ASSETS.map(s => {
        const current = marketPrices[s.ticker];
        const prev = previousPrices[s.ticker];
        const isUp = current >= prev;
        const changeClass = isUp ? 'up' : 'down';
        const changePct = Math.abs(((current - prev)/prev)*100).toFixed(1);
        const sign = isUp ? '+' : '-';
        
        const isActive = currentSelectedAsset === s.ticker ? 'active' : '';

        return `
            <div class="asset-item ${isActive}" onclick="selectAsset('${s.ticker}')">
                <div class="asset-info">
                    <div class="asset-name" style="color: ${s.color};">${s.name}</div>
                    <div class="asset-ticker">${s.ticker}</div>
                </div>
                <div class="asset-price-box">
                    <div class="asset-price">$${current.toFixed(2)}</div>
                    <div class="asset-change ${changeClass}">${sign}${changePct}%</div>
                </div>
            </div>
        `;
    }).join('');
}

window.selectAsset = function(ticker) {
    currentSelectedAsset = ticker;
    renderAssetList();
    renderMainView();
}

function renderMainView() {
    const asset = ALL_ASSETS.find(a => a.ticker === currentSelectedAsset);
    if (!asset) return;

    const current = marketPrices[asset.ticker];
    const prev = previousPrices[asset.ticker];
    const isUp = current >= prev;
    const changeClass = isUp ? 'up' : 'down';
    const changePct = Math.abs(((current - prev)/prev)*100).toFixed(1);
    const sign = isUp ? '+' : '-';

    document.getElementById('main-name').innerHTML = `<span style="color:${asset.color};">${asset.name}</span>`;
    document.getElementById('main-price').innerText = `$${current.toFixed(2)}`;
    
    const changeEl = document.getElementById('main-change');
    changeEl.innerText = `${sign}${changePct}% (Current Tick)`;
    changeEl.className = `main-change ${changeClass}`;

    document.getElementById('trade-section').style.display = 'flex';
    const qty = portfolio.holdings[asset.ticker] || 0;
    const val = qty * current;
    document.getElementById('pos-shares').innerText = `${qty} Shares Held`;
    document.getElementById('pos-value').innerText = `Value: $${val.toFixed(2)}`;

    document.getElementById('btn-buy').disabled = portfolio.cash < current;
    document.getElementById('btn-buy-max').disabled = portfolio.cash < current;
    document.getElementById('btn-sell').disabled = qty <= 0;
    document.getElementById('btn-sell-all').disabled = qty <= 0;
}

window.tradeSelected = function(action) {
    const ticker = currentSelectedAsset;
    const price = marketPrices[ticker];
    const qty = portfolio.holdings[ticker] || 0;
    
    if (action === 'buy' && portfolio.cash >= price) {
        portfolio.cash -= price;
        portfolio.holdings[ticker] = qty + 1;
    } else if (action === 'buy_max' && portfolio.cash >= price) {
        const maxBuy = Math.floor(portfolio.cash / price);
        portfolio.cash -= maxBuy * price;
        portfolio.holdings[ticker] = qty + maxBuy;
    } else if (action === 'sell' && qty > 0) {
        portfolio.holdings[ticker] = qty - 1;
        portfolio.cash += price;
    } else if (action === 'sell_all' && qty > 0) {
        portfolio.cash += qty * price;
        portfolio.holdings[ticker] = 0;
    }
    
    saveData();
    renderMainView();
    renderPortfolio();
}

function renderPortfolio() {
    let netWorth = portfolio.cash;
    ALL_ASSETS.forEach(s => {
        const qty = portfolio.holdings[s.ticker] || 0;
        if (qty > 0) netWorth += qty * marketPrices[s.ticker];
    });

    const nwDisplay = document.getElementById('net-worth-display');
    const cashDisplay = document.getElementById('cash-display');
    if (nwDisplay) nwDisplay.innerText = `$${netWorth.toFixed(2)}`;
    if (cashDisplay) cashDisplay.innerText = `Buying Power: $${portfolio.cash.toFixed(2)}`;
    saveData();
}

function saveData() {
    if (currentUser) {
        localStorage.setItem(`beef_global_portfolio_${currentUser.id}`, JSON.stringify({
            cash: portfolio.cash,
            holdings: portfolio.holdings
        }));
    }
}

async function syncNetWorth() {
    if (!currentUser) return;
    let netWorth = portfolio.cash;
    Object.keys(portfolio.holdings).forEach(ticker => {
        netWorth += (portfolio.holdings[ticker] || 0) * marketPrices[ticker];
    });

    await _supabase.from('market_players').upsert({
        id: currentUser.id, name: currentName, net_worth: netWorth, updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
}

async function fetchLeaderboard() {
    const { data, error } = await _supabase.from('market_players').select('name, net_worth').order('net_worth', { ascending: false }).limit(15);
    if (error || !data) return;

    const list = document.getElementById('market-leaderboard');
    if (!list) return;

    list.innerHTML = data.map((p, i) => `
        <div class="lb-row ${i === 0 ? 'top' : ''}">
            <span class="lb-name">#${i + 1} ${sanitize(p.name)}</span>
            <span class="lb-net" style="color: var(--accent);">$${parseFloat(p.net_worth).toFixed(2)}</span>
        </div>
    `).join('');
}

// Global Charts Setup
function initChart() {
    const ctx = document.getElementById('priceChart');
    if (!ctx) return;

    // Display all assets by default as multiple lines
    const datasets = ALL_ASSETS.map(asset => ({
        label: asset.ticker,
        data: priceHistory[asset.ticker],
        borderColor: asset.color,
        backgroundColor: asset.color + '44', // slightly transparent
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.1,
        hidden: false // all visible by default
    }));

    priceChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array(MAX_HISTORY + 1).fill(''),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 500 }, // smooth transitions for updates
            plugins: { 
                legend: { 
                    display: true, 
                    position: 'bottom',
                    labels: { color: '#888', boxWidth: 10, padding: 8 }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: { grid: { color: '#222' }, ticks: { color: '#888', font: { family: 'Space Mono' } } },
                x: { grid: { display: false } }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

window.changeChartType = function() {
    if (!priceChart) return;
    const type = document.getElementById('global-chart-type').value;
    
    if (type === 'doughnut') {
        // Doughnut requires single points. We map the LATEST price.
        const currentData = ALL_ASSETS.map(a => marketPrices[a.ticker]);
        const bgColors = ALL_ASSETS.map(a => a.color);
        
        priceChart.config.type = 'doughnut';
        priceChart.data = {
            labels: ALL_ASSETS.map(a => a.ticker),
            datasets: [{
                data: currentData,
                backgroundColor: bgColors,
                borderWidth: 0
            }]
        };
    } else {
        // Reset to time series
        const datasets = ALL_ASSETS.map(asset => ({
            label: asset.ticker,
            data: priceHistory[asset.ticker],
            borderColor: asset.color,
            backgroundColor: asset.color + '44',
            borderWidth: type === 'radar' ? 1 : 2,
            pointRadius: type === 'radar' ? 2 : 0,
            fill: type === 'radar' || type === 'bar',
            tension: 0.1,
            hidden: false
        }));

        priceChart.config.type = type;
        priceChart.data = {
            labels: Array(MAX_HISTORY + 1).fill(''),
            datasets: datasets
        };
    }
    
    priceChart.update();
}

window.toggleAllAssets = function() {
    if (!priceChart) return;
    
    const type = document.getElementById('global-chart-type').value;
    if (type === 'doughnut') return; // Cannot toggle lines on doughnut
    
    const isAnyVisible = priceChart.data.datasets.some(ds => !ds.hidden);
    
    priceChart.data.datasets.forEach(ds => {
        ds.hidden = isAnyVisible; // Toggle all off if any are on
    });
    priceChart.update();
}

function updateChartData() {
    if (!priceChart) return;
    
    const type = document.getElementById('global-chart-type').value;
    
    if (type === 'doughnut') {
        priceChart.data.datasets[0].data = ALL_ASSETS.map(a => marketPrices[a.ticker]);
    } else {
        ALL_ASSETS.forEach((asset, i) => {
            priceChart.data.datasets[i].data = priceHistory[asset.ticker];
        });
    }
    
    priceChart.update();
}

document.addEventListener('DOMContentLoaded', init);
