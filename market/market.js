// Supabase Configuration
const SUPABASE_URL = 'https://sqbdiniogmxxwolckozp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qq32D3lzkUOGvc_5HaZMiQ_1lnmiZOZ';
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Market State
let currentUser = null;
let currentName = 'Anonymous Trader';

let portfolio = {
    cash: 1000.00,
    holdings: {}
};

// Core Assets
const STOCKS = [
    { ticker: 'AMR', name: 'Amr', price: 100, vol: 0.02 },
    { ticker: 'AYRN', name: 'AyAron', price: 150, vol: 0.05 },
    { ticker: 'JSPR', name: 'Jasper', price: 50, vol: 0.15 },
    { ticker: 'MAX', name: 'Max', price: 120, vol: 0.03 },
    { ticker: 'SGN', name: 'Sagan', price: 80, vol: 0.08 },
    { ticker: 'TBN', name: 'T-Bone', price: 90, vol: 0.06 },
    { ticker: 'AHMD', name: 'Ahmed', price: 200, vol: 0.04 },
    { ticker: 'LTHM', name: 'Latham', price: 40, vol: 0.12 },
    { ticker: 'DEV', name: 'Dev', price: 65, vol: 0.10 },
    { ticker: 'TJ', name: 'TJ', price: 46, vol: 0.14 },
    { ticker: 'MAC', name: 'Mac', price: 250, vol: 0.03 },
    { ticker: 'PRST', name: 'Preston', price: 300, vol: 0.05 },
    { ticker: 'LI', name: 'Li Mills', price: 75, vol: 0.18 },
    { ticker: 'JVR', name: 'Javier', price: 110, vol: 0.07 },
    { ticker: 'SAM', name: 'Sam Bradley', price: 180, vol: 0.06 }
];

// Composite Assets (Index Funds)
const INDEX_FUNDS = [
    { ticker: 'FRSH', name: 'Freshman ETF', components: ['AHMD', 'LI'], desc: 'Ahmed + Li' },
    { ticker: 'SHNGN', name: 'Shenanigan Index', components: ['LI', 'SAM'], desc: 'Li + Sam' },
    { ticker: 'ROYAL', name: 'Clavicular Trust', components: ['PRST', 'JVR'], desc: 'Preston + Javier' }
];

let marketPrices = {};
let previousPrices = {};
let priceHistory = {}; 
const MAX_HISTORY = 60; // 60 ticks of history

let algoRules = [];

const NEWS_EVENTS = [
    { text: "BREAKING: Li Mills and AyAron double-fumble.", impacts: { 'LI': -0.3, 'AYRN': -0.2 } },
    { text: "BREAKING: Mac hits 500-day Duolingo streak.", impacts: { 'MAC': 0.2 } },
    { text: "BREAKING: Preston searches bomb instructions.", impacts: { 'PRST': -0.4 } },
    { text: "BREAKING: Sam Bradley claims ankles.", impacts: { 'SAM': 0.3 } },
    { text: "BREAKING: Javier proves Agartha.", impacts: { 'JVR': 0.3 } },
    { text: "BREAKING: Ahmed spotted near sophomore.", impacts: { 'AHMD': 0.2 } },
    { text: "BREAKING: Jasper caught lying about height.", impacts: { 'JSPR': -0.3 } }
];

// Chart Instance
let priceChart = null;

async function init() {
    let { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        document.getElementById('market-login-btn').addEventListener('click', () => {
            _supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href }});
        });
        return;
    }

    document.getElementById('auth-wall').style.display = 'none';
    document.getElementById('tabs-container').style.display = 'flex';
    
    currentUser = session.user;
    currentName = currentUser.user_metadata?.full_name || currentUser.email || 'Trader';

    // Load Local Data
    const savedData = localStorage.getItem(`beef_portfolio_v2_${currentUser.id}`);
    if (savedData) {
        const parsed = JSON.parse(savedData);
        portfolio.cash = parsed.cash;
        portfolio.holdings = parsed.holdings || {};
        algoRules = parsed.algoRules || [];
    }

    // Init Prices & History
    STOCKS.forEach(s => {
        marketPrices[s.ticker] = s.price;
        previousPrices[s.ticker] = s.price;
        priceHistory[s.ticker] = Array(MAX_HISTORY).fill(s.price);
        if (portfolio.holdings[s.ticker] === undefined) portfolio.holdings[s.ticker] = 0;
    });
    INDEX_FUNDS.forEach(f => {
        let sum = 0;
        f.components.forEach(c => sum += marketPrices[c]);
        let price = sum / f.components.length;
        marketPrices[f.ticker] = price;
        previousPrices[f.ticker] = price;
        priceHistory[f.ticker] = Array(MAX_HISTORY).fill(price);
        if (portfolio.holdings[f.ticker] === undefined) portfolio.holdings[f.ticker] = 0;
    });

    initUI();
    startMarketSimulation();
    
    syncNetWorth();
    fetchLeaderboard();
    setInterval(syncNetWorth, 10000);
    
    _supabase.channel('public:market_players')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'market_players' }, () => {
            fetchLeaderboard();
        }).subscribe();
}

function initUI() {
    // Setup Dropdowns for Chart & Algo
    const allAssets = [...STOCKS, ...INDEX_FUNDS];
    const chartSel = document.getElementById('chart-selector');
    const algoSel = document.getElementById('algo-asset');
    
    let optionsHtml = allAssets.map(a => `<option value="${a.ticker}">${a.name} ($${a.ticker})</option>`).join('');
    chartSel.innerHTML = optionsHtml;
    algoSel.innerHTML = optionsHtml;

    initChart();
    renderMarket();
    renderPortfolio();
    renderAlgoList();
}

window.switchTab = function(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');

    if (tabId === 'intel') {
        updateChartData();
        updateIntel();
    }
}

function startMarketSimulation() {
    // Tick every 2 seconds
    setInterval(() => {
        // Core Stocks
        STOCKS.forEach(s => {
            previousPrices[s.ticker] = marketPrices[s.ticker];
            const change = 1 + ((Math.random() * 2 - 1) * s.vol);
            marketPrices[s.ticker] = Math.max(1, marketPrices[s.ticker] * change);
        });

        // Index Funds
        INDEX_FUNDS.forEach(f => {
            previousPrices[f.ticker] = marketPrices[f.ticker];
            let sum = 0;
            f.components.forEach(c => sum += marketPrices[c]);
            marketPrices[f.ticker] = sum / f.components.length;
        });

        // Record History
        Object.keys(marketPrices).forEach(ticker => {
            priceHistory[ticker].push(marketPrices[ticker]);
            if (priceHistory[ticker].length > MAX_HISTORY) priceHistory[ticker].shift();
        });

        runAlgos();

        renderMarket();
        renderPortfolio();
        
        if (document.getElementById('tab-intel').classList.contains('active')) {
            updateIntel();
            updateChartData();
        }
    }, 2000);

    // News Events
    setInterval(() => {
        const event = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
        document.getElementById('news-marquee').innerText = event.text;

        for (const [ticker, impact] of Object.entries(event.impacts)) {
            marketPrices[ticker] = Math.max(1, marketPrices[ticker] * (1 + impact));
        }
    }, 15000);
}

// ALGORITHMIC TRADING
window.addAlgoRule = function() {
    const asset = document.getElementById('algo-asset').value;
    const cond = document.getElementById('algo-condition').value;
    const price = parseFloat(document.getElementById('algo-price').value);
    const action = document.getElementById('algo-action').value;
    const qty = parseInt(document.getElementById('algo-qty').value);

    if (isNaN(price) || isNaN(qty) || qty <= 0) return alert("Invalid numbers");

    algoRules.push({
        id: Date.now(),
        asset, condition, price, action, qty
    });
    
    saveData();
    renderAlgoList();
}

window.removeAlgoRule = function(id) {
    algoRules = algoRules.filter(r => r.id !== id);
    saveData();
    renderAlgoList();
}

function renderAlgoList() {
    const list = document.getElementById('algo-list');
    if (algoRules.length === 0) {
        list.innerHTML = '<div style="color: #444; font-size: 0.9rem;">No active algorithms.</div>';
        return;
    }

    list.innerHTML = algoRules.map(r => `
        <div class="algo-item">
            <div>
                <strong>IF</strong> $${r.asset} 
                ${r.condition === 'drops_below' ? '<span class="down">↓ drops below</span>' : '<span class="up">↑ goes above</span>'} 
                $${r.price} 
                <strong>THEN</strong> <span class="${r.action === 'buy' ? 'up' : 'down'}">${r.action.toUpperCase()}</span> ${r.qty}
            </div>
            <button class="btn btn-sell" style="padding: 0.2rem 0.5rem;" onclick="removeAlgoRule(${r.id})">X</button>
        </div>
    `).join('');
}

function runAlgos() {
    let triggered = false;
    algoRules.forEach(rule => {
        const currentPrice = marketPrices[rule.asset];
        let conditionMet = false;
        
        if (rule.condition === 'drops_below' && currentPrice < rule.price) conditionMet = true;
        if (rule.condition === 'goes_above' && currentPrice > rule.price) conditionMet = true;

        if (conditionMet) {
            if (rule.action === 'buy' && portfolio.cash >= currentPrice * rule.qty) {
                portfolio.cash -= currentPrice * rule.qty;
                portfolio.holdings[rule.asset] += rule.qty;
                triggered = true;
            } else if (rule.action === 'sell' && portfolio.holdings[rule.asset] >= rule.qty) {
                portfolio.cash += currentPrice * rule.qty;
                portfolio.holdings[rule.asset] -= rule.qty;
                triggered = true;
            }
        }
    });

    if (triggered) saveData();
}

// INTEL & CHARTS
function updateIntel() {
    let best = { ticker: '', change: -999 };
    let worst = { ticker: '', change: 999 };
    let volatile = { ticker: '', spread: 0 };

    const allAssets = [...STOCKS, ...INDEX_FUNDS];
    
    allAssets.forEach(a => {
        const hist = priceHistory[a.ticker];
        if (!hist) return;
        const oldPrice = hist[0];
        const newPrice = hist[hist.length - 1];
        const pctChange = ((newPrice - oldPrice) / oldPrice) * 100;
        
        const min = Math.min(...hist);
        const max = Math.max(...hist);
        const spread = ((max - min) / min) * 100;

        if (pctChange > best.change) best = { ticker: a.ticker, change: pctChange };
        if (pctChange < worst.change) worst = { ticker: a.ticker, change: pctChange };
        if (spread > volatile.spread) volatile = { ticker: a.ticker, spread: spread };
    });

    document.getElementById('intel-gainer').innerText = `$${best.ticker} (+${best.change.toFixed(1)}%)`;
    document.getElementById('intel-loser').innerText = `$${worst.ticker} (${worst.change.toFixed(1)}%)`;
    document.getElementById('intel-volatile').innerText = `$${volatile.ticker}`;
}

function initChart() {
    const ctx = document.getElementById('priceChart').getContext('2d');
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(MAX_HISTORY).fill(''),
            datasets: [{
                label: 'Price',
                data: [],
                borderColor: '#00ff41',
                backgroundColor: 'rgba(0, 255, 65, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#222' }, ticks: { color: '#666' } },
                x: { grid: { display: false } }
            }
        }
    });
}

window.updateChartData = function() {
    if (!priceChart) return;
    const ticker = document.getElementById('chart-selector').value;
    priceChart.data.datasets[0].data = priceHistory[ticker];
    priceChart.update();
}

// RENDERING
function renderMarket() {
    const list = document.getElementById('stock-list');
    const allAssets = [...STOCKS, ...INDEX_FUNDS];
    
    list.innerHTML = allAssets.map(s => {
        const current = marketPrices[s.ticker];
        const prev = previousPrices[s.ticker];
        const isUp = current >= prev;
        const changeClass = isUp ? 'up' : 'down';
        const changeSymbol = isUp ? '▲' : '▼';
        const isIndex = INDEX_FUNDS.find(f => f.ticker === s.ticker);
        
        return `
            <div class="stock-row ${isIndex ? 'index-fund' : ''}">
                <div>
                    <div class="stock-name">${s.name} ${isIndex ? '<span style="font-size:0.6rem;color:#00d2ff;">ETF</span>' : ''}</div>
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

    const allAssets = [...STOCKS, ...INDEX_FUNDS];

    allAssets.forEach(s => {
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
    document.getElementById('holdings-list').innerHTML = holdingsHtml || '<div style="color: #444;">No open positions.</div>';
    
    saveData();
}

function saveData() {
    if (currentUser) {
        localStorage.setItem(`beef_portfolio_v2_${currentUser.id}`, JSON.stringify({
            cash: portfolio.cash,
            holdings: portfolio.holdings,
            algoRules: algoRules
        }));
    }
}

// TRADING ACTIONS
window.buy = function(ticker) {
    const price = marketPrices[ticker];
    if (portfolio.cash >= price) {
        portfolio.cash -= price;
        portfolio.holdings[ticker] += 1;
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

// LEADERBOARD
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
    const { data, error } = await _supabase.from('market_players').select('name, net_worth').order('net_worth', { ascending: false }).limit(10);
    if (error || !data) return;

    document.getElementById('market-leaderboard').innerHTML = data.map((p, i) => `
        <div class="lb-row ${i === 0 ? 'top' : ''}">
            <span>#${i + 1} ${p.name}</span>
            <span style="color: var(--green); font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem;">$${parseFloat(p.net_worth).toFixed(2)}</span>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', init);
