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
    { ticker: 'AMR', name: 'Amr', price: 100, vol: 0.02, color: '#ff003c' },
    { ticker: 'AYRN', name: 'AyAron', price: 150, vol: 0.05, color: '#00ff41' },
    { ticker: 'JSPR', name: 'Jasper', price: 50, vol: 0.15, color: '#00d2ff' },
    { ticker: 'MAX', name: 'Max', price: 120, vol: 0.03, color: '#f1c40f' },
    { ticker: 'SGN', name: 'Sagan', price: 80, vol: 0.08, color: '#9b59b6' },
    { ticker: 'TBN', name: 'T-Bone', price: 90, vol: 0.06, color: '#e67e22' },
    { ticker: 'AHMD', name: 'Ahmed', price: 200, vol: 0.04, color: '#1abc9c' },
    { ticker: 'LTHM', name: 'Latham', price: 40, vol: 0.12, color: '#34495e' },
    { ticker: 'DEV', name: 'Dev', price: 65, vol: 0.10, color: '#e74c3c' },
    { ticker: 'TJ', name: 'TJ', price: 46, vol: 0.14, color: '#2ecc71' },
    { ticker: 'MAC', name: 'Mac', price: 250, vol: 0.03, color: '#3498db' },
    { ticker: 'PRST', name: 'Preston', price: 300, vol: 0.05, color: '#f39c12' },
    { ticker: 'LI', name: 'Li Mills', price: 75, vol: 0.18, color: '#8e44ad' },
    { ticker: 'JVR', name: 'Javier', price: 110, vol: 0.07, color: '#d35400' },
    { ticker: 'SAM', name: 'Sam Bradley', price: 180, vol: 0.06, color: '#16a085' }
];

// Composite Assets (Index Funds)
const INDEX_FUNDS = [
    { ticker: 'FRSH', name: 'Freshman ETF', components: ['AHMD', 'LI'], desc: 'Ahmed + Li', color: '#ff00ff' },
    { ticker: 'SHNGN', name: 'Shenanigan Index', components: ['LI', 'SAM'], desc: 'Li + Sam', color: '#ffff00' },
    { ticker: 'ROYAL', name: 'Clavicular Trust', components: ['PRST', 'JVR'], desc: 'Preston + Javier', color: '#00ffff' }
];

const ALL_ASSETS = [...STOCKS, ...INDEX_FUNDS];

let marketPrices = {};
let previousPrices = {};
let priceHistory = {}; 
const MAX_HISTORY = 60;

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

    // Load Local Data
    const savedData = localStorage.getItem(`beef_portfolio_v3_${currentUser.id}`);
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
    const algoSel = document.getElementById('algo-asset');
    let optionsHtml = ALL_ASSETS.map(a => `<option value="${a.ticker}">${a.name} ($${a.ticker})</option>`).join('');
    if (algoSel) algoSel.innerHTML = optionsHtml;

    initChart();
    renderMarket();
    renderPortfolio();
    renderAlgoList();
}

function startMarketSimulation() {
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
        updateChartData();
        
    }, 2000);

    // News Events
    setInterval(() => {
        const event = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
        const marquee = document.getElementById('news-marquee');
        if (marquee) marquee.innerText = event.text;

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

    algoRules.push({ id: Date.now(), asset, condition, price, action, qty });
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
    if (!list) return;
    
    if (algoRules.length === 0) {
        list.innerHTML = '<div style="color: #444; font-size: 0.8rem; text-align: center; padding: 1rem;">No active algorithms.</div>';
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
            <button class="btn btn-sell" style="padding: 0.1rem 0.4rem; font-size:0.6rem;" onclick="removeAlgoRule(${r.id})">X</button>
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

// CHARTS
function initChart() {
    const ctx = document.getElementById('priceChart');
    if (!ctx) return;

    const datasets = ALL_ASSETS.map(asset => ({
        label: asset.ticker,
        data: priceHistory[asset.ticker],
        borderColor: asset.color,
        backgroundColor: asset.color + '33', // 20% opacity
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.1
    }));

    priceChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array(MAX_HISTORY).fill(''),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { 
                legend: { 
                    display: true, 
                    position: 'bottom',
                    labels: { color: '#e0e0e0', font: { size: 10 } }
                } 
            },
            scales: {
                y: { grid: { color: '#222' }, ticks: { color: '#666' } },
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

window.updateChartConfig = function() {
    if (!priceChart) return;
    const type = document.getElementById('chart-type').value;
    priceChart.config.type = type;
    
    // Adjust fill for bar charts to look better
    priceChart.data.datasets.forEach(ds => {
        if (type === 'bar') {
            ds.backgroundColor = ds.borderColor + '88'; // more opaque for bars
            ds.borderWidth = 1;
        } else {
            ds.backgroundColor = ds.borderColor + '33'; 
            ds.borderWidth = 2;
            ds.fill = false;
        }
    });
    
    priceChart.update();
}

function updateChartData() {
    if (!priceChart) return;
    
    ALL_ASSETS.forEach((asset, i) => {
        priceChart.data.datasets[i].data = priceHistory[asset.ticker];
    });
    priceChart.update();
}

// RENDERING
function renderMarket() {
    const list = document.getElementById('stock-list');
    if (!list) return;
    
    list.innerHTML = ALL_ASSETS.map(s => {
        const current = marketPrices[s.ticker];
        const prev = previousPrices[s.ticker];
        const isUp = current >= prev;
        const changeClass = isUp ? 'up' : 'down';
        const changeSymbol = isUp ? '▲' : '▼';
        const isIndex = INDEX_FUNDS.find(f => f.ticker === s.ticker);
        
        return `
            <div class="stock-row ${isIndex ? 'index-fund' : ''}">
                <div>
                    <div class="stock-name">${s.name} ${isIndex ? '<span style="font-size:0.6rem;color:#00d2ff;vertical-align:top;">ETF</span>' : ''}</div>
                    <div class="stock-ticker" style="color: ${s.color};">$${s.ticker}</div>
                </div>
                <div class="stock-price">$${current.toFixed(2)}</div>
                <div class="stock-change ${changeClass}">${changeSymbol} ${Math.abs(((current - prev)/prev)*100).toFixed(1)}%</div>
                <div class="actions">
                    <button class="btn btn-sell" onclick="sell('${s.ticker}')" ${portfolio.holdings[s.ticker] <= 0 ? 'disabled' : ''}>S</button>
                    <button class="btn btn-buy" onclick="buy('${s.ticker}')" ${portfolio.cash < current ? 'disabled' : ''}>B</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderPortfolio() {
    let netWorth = portfolio.cash;
    let holdingsHtml = '';

    ALL_ASSETS.forEach(s => {
        const qty = portfolio.holdings[s.ticker] || 0;
        if (qty > 0) {
            const value = qty * marketPrices[s.ticker];
            netWorth += value;
            holdingsHtml += `
                <div class="holding-item">
                    <span>${qty}x <span style="color:${s.color}">$${s.ticker}</span></span>
                    <span>$${value.toFixed(2)}</span>
                </div>
            `;
        }
    });

    const nwDisplay = document.getElementById('net-worth-display');
    const cashDisplay = document.getElementById('cash-display');
    const hList = document.getElementById('holdings-list');

    if (nwDisplay) nwDisplay.innerText = `$${netWorth.toFixed(2)}`;
    if (cashDisplay) cashDisplay.innerText = `Liquid: $${portfolio.cash.toFixed(2)}`;
    if (hList) hList.innerHTML = holdingsHtml || '<div style="color: #444; font-size: 0.8rem; text-align: center;">No open positions.</div>';
    
    saveData();
}

function saveData() {
    if (currentUser) {
        localStorage.setItem(`beef_portfolio_v3_${currentUser.id}`, JSON.stringify({
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
    const { data, error } = await _supabase.from('market_players').select('name, net_worth').order('net_worth', { ascending: false }).limit(15);
    if (error || !data) return;

    const list = document.getElementById('market-leaderboard');
    if (!list) return;

    list.innerHTML = data.map((p, i) => `
        <div class="lb-row ${i === 0 ? 'top' : ''}">
            <span class="lb-name">#${i + 1} ${sanitize(p.name)}</span>
            <span style="color: var(--green); font-family: 'Bebas Neue', sans-serif; font-size: 1.1rem;">$${parseFloat(p.net_worth).toFixed(2)}</span>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', init);
