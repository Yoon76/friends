// Supabase Configuration
const SUPABASE_URL = 'https://sqbdiniogmxxwolckozp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qq32D3lzkUOGvc_5HaZMiQ_1lnmiZOZ';
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const COSTS = {
    TRAIN: 10000,
    TANK: 50000,
    MOVE: 0,
    ATTACK: 0
};

let currentUser = null;
let currentNation = null;
let territories = [];
let nations = {};
let selectedTerritoryId = null;
let targetingMode = null; // 'MOVE' or 'ATTACK'
let currentDay = Math.floor((Date.now() - 21600000) / 86400000);
let portfolio = { cash: 0 };
let orders = [];

async function init() {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        document.getElementById('login-btn').onclick = () => {
            _supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href }});
        };
        return;
    }

    document.getElementById('auth-wall').style.display = 'none';
    currentUser = session.user;
    
    // Load cash from portfolio
    const baseKey = `beef_global_portfolio_${currentUser.id}`;
    const savedData = localStorage.getItem(baseKey);
    if (savedData) {
        try {
            portfolio = JSON.parse(savedData);
        } catch(e) {}
    }
    
    document.getElementById('user-name').innerText = currentUser.user_metadata?.full_name || currentUser.email;
    document.getElementById('day-display').innerText = currentDay;
    
    await loadGameState();
    setupSubscription();
    checkResolution();
}

async function loadGameState() {
    // Load Nations
    const { data: nData } = await _supabase.from('nations').select('*');
    nations = {};
    if (nData) nData.forEach(n => nations[n.id] = n);
    
    // Identify current user's nation
    currentNation = nData?.find(n => n.user_id === currentUser.id);
    if (!currentNation) {
        const name = prompt("COMMANDER, IDENTIFY YOUR NATION:") || "New Republic";
        const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
        const { data: newNation } = await _supabase.from('nations').insert({
            user_id: currentUser.id,
            name: name,
            color: color
        }).select().single();
        if (newNation) {
            currentNation = newNation;
            nations[newNation.id] = newNation;
        }
    }

    // Load Territories
    const { data: tData } = await _supabase.from('territories').select('*').order('id');
    territories = tData || [];

    // Load Orders for today
    if (currentNation) {
        const { data: oData } = await _supabase.from('nation_orders')
            .select('*')
            .eq('nation_id', currentNation.id)
            .eq('day', currentDay);
        orders = oData || [];
    }

    renderMap();
    renderOrders();
    updateUI();
}

function updateUI() {
    document.getElementById('user-cash').innerText = `$${portfolio.cash.toLocaleString()}`;
    if (currentNation) {
        document.getElementById('stat-name').innerText = currentNation.name;
        document.getElementById('stat-name').style.color = currentNation.color;
        document.getElementById('stat-cash').innerText = `$${portfolio.cash.toLocaleString()}`;
        const myTerrs = territories.filter(t => t.owner_id === currentNation.id);
        document.getElementById('stat-terrs').innerText = myTerrs.length;
    }

    if (selectedTerritoryId !== null) {
        const t = territories[selectedTerritoryId];
        const owner = t.owner_id ? (nations[t.owner_id]?.name || 'Unknown') : 'NEUTRAL';
        const ownerColor = t.owner_id ? (nations[t.owner_id]?.color || '#fff') : '#fff';
        
        document.getElementById('selected-id').innerText = t.id;
        document.getElementById('territory-details').innerHTML = `
            <div class="stat-row"><span>TYPE:</span> <span>${t.type.toUpperCase()}</span></div>
            <div class="stat-row"><span>OWNER:</span> <span style="color: ${ownerColor}">${owner}</span></div>
            <div class="stat-row"><span>TROOPS:</span> <span>${t.troops}</span></div>
            <div class="stat-row"><span>TANKS:</span> <span>${t.tanks}</span></div>
            <div class="stat-row"><span>FORTS:</span> <span>${t.fortifications}</span></div>
        `;
        
        const isOwner = t.owner_id === currentNation?.id;
        document.getElementById('action-controls').style.display = 'block';

        const myTerrs = territories.filter(x => x.owner_id === currentNation?.id);
        const canClaim = !t.owner_id && myTerrs.length === 0;
        document.getElementById('claim-btn').style.display = canClaim ? 'block' : 'none';

        // Hide other controls if not owner
        document.querySelectorAll('#action-controls .btn:not(#claim-btn)').forEach(b => {
            b.style.display = isOwner ? 'block' : 'none';
        });

        if (isOwner) {
            document.getElementById('move-btn').disabled = (t.troops === 0 && t.tanks === 0);
            document.getElementById('attack-btn').disabled = (t.troops === 0 && t.tanks === 0);
        }
    }
}

async function claimSector() {
    if (!currentNation) return;
    const { error } = await _supabase.from('territories')
        .update({ owner_id: currentNation.id, troops: 10 })
        .eq('id', selectedTerritoryId)
        .is('owner_id', null);
    
    if (!error) {
        loadGameState();
    }
}

function renderMap() {
    const map = document.getElementById('map');
    map.innerHTML = '';
    territories.forEach(t => {
        const div = document.createElement('div');
        div.className = `territory ${t.type.toLowerCase()}`;
        if (selectedTerritoryId === t.id) div.classList.add('selected');
        
        if (t.owner_id && nations[t.owner_id]) {
            div.style.boxShadow = `inset 0 0 20px ${nations[t.owner_id].color}88`;
            div.style.borderColor = nations[t.owner_id].color;
        }

        div.onclick = () => handleMapClick(t.id);
        
        div.innerHTML = `
            <div style="opacity: 0.3; position: absolute; top: 2px; left: 2px;">${t.id}</div>
            <div class="unit-count">
                ${t.troops > 0 ? '🎖️' + t.troops : ''}
                ${t.tanks > 0 ? '🚜' + t.tanks : ''}
            </div>
        `;
        map.appendChild(div);
    });
}

function handleMapClick(id) {
    if (targetingMode) {
        executeTargetedOrder(id);
    } else {
        selectedTerritoryId = id;
        renderMap();
        updateUI();
    }
}

function startTargeting(mode) {
    targetingMode = mode;
    document.getElementById('targeting-notice').style.display = 'block';
    document.getElementById('action-controls').style.display = 'none';
}

function cancelTargeting() {
    targetingMode = null;
    document.getElementById('targeting-notice').style.display = 'none';
    document.getElementById('action-controls').style.display = 'block';
}

async function executeTargetedOrder(targetId) {
    const sourceId = selectedTerritoryId;
    if (sourceId === targetId) return cancelTargeting();
    
    // Check if target is adjacent (simple grid adjacency)
    const sX = sourceId % 10, sY = Math.floor(sourceId / 10);
    const tX = targetId % 10, tY = Math.floor(targetId / 10);
    if (Math.abs(sX - tX) > 1 || Math.abs(sY - tY) > 1) {
        alert("TARGET OUT OF RANGE. SELECT ADJACENT SECTOR.");
        return;
    }

    if (!currentNation) return;

    const { error } = await _supabase.from('nation_orders').insert({
        nation_id: currentNation.id,
        day: currentDay,
        territory_id: sourceId,
        order_type: targetingMode,
        target_id: targetId,
        amount: 0 // Moves/Attacks use all units from source for now
    });

    if (!error) {
        cancelTargeting();
        loadGameState();
    }
}

async function queueOrder(type) {
    if (!currentNation) return;
    const cost = COSTS[type];
    if (portfolio.cash < cost) return alert("INSUFFICIENT FUNDS.");

    const { error } = await _supabase.from('nation_orders').insert({
        nation_id: currentNation.id,
        day: currentDay,
        territory_id: selectedTerritoryId,
        order_type: type
    });

    if (!error) {
        portfolio.cash -= cost;
        savePortfolio();
        loadGameState();
    }
}

function savePortfolio() {
    const baseKey = `beef_global_portfolio_${currentUser.id}`;
    localStorage.setItem(baseKey, JSON.stringify(portfolio));
    updateUI();
}

function renderOrders() {
    const list = document.getElementById('orders-list');
    list.innerHTML = orders.map(o => `
        <div class="order-item">
            <span>${o.order_type} @ ${o.territory_id} ${o.target_id !== null ? '-> ' + o.target_id : ''}</span>
            <span style="color: var(--crt-amber)">QUEUED</span>
        </div>
    `).join('');
}

function setupSubscription() {
    _supabase.channel('game_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'territories' }, loadGameState)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'nation_game_state' }, checkResolution)
        .subscribe();
}

async function checkResolution() {
    const { data: state } = await _supabase.from('nation_game_state').select('*').single();
    if (!state) return;

    // Catch up logic: if game just started, don't resolve from day 0
    if (state.last_resolved_day === 0) {
        await _supabase.from('nation_game_state').update({ last_resolved_day: currentDay - 1 }).eq('id', 1);
        return;
    }

    if (currentDay > state.last_resolved_day) {
        console.log("RESOLUTION REQUIRED. DAY:", state.last_resolved_day + 1);
        resolveTurn(state.last_resolved_day + 1);
    }
}

async function resolveTurn(targetDay) {
    // Attempt to "lock" resolution by updating last_resolved_day
    const { data, error } = await _supabase.from('nation_game_state')
        .update({ last_resolved_day: targetDay })
        .eq('id', 1)
        .eq('last_resolved_day', targetDay - 1)
        .select();

    if (error || !data || !data.length) return; 

    const log = document.getElementById('resolution-log');
    log.innerHTML = `<div class="log-entry">--- COMMENCING RESOLUTION FOR DAY ${targetDay} ---</div>`;
    document.getElementById('resolution-overlay').style.display = 'block';

    // 1. Fetch all orders for targetDay
    const { data: allOrders } = await _supabase.from('nation_orders')
        .select('*')
        .eq('day', targetDay)
        .eq('resolved', false);

    // 2. Fetch current territories
    const { data: currentTerrs } = await _supabase.from('territories').select('*').order('id');
    let localTerrs = [...(currentTerrs || [])];

    // 3. Process Production (TRAIN, TANK)
    if (allOrders) {
        allOrders.filter(o => o.order_type === 'TRAIN' || o.order_type === 'TANK').forEach(o => {
            const t = localTerrs.find(x => x.id === o.territory_id);
            if (t) {
                if (o.order_type === 'TRAIN') t.troops += 10;
                if (o.order_type === 'TANK') t.tanks += 2;
                log.innerHTML += `<div class="log-entry log-build">SECTOR ${t.id}: Production complete.</div>`;
            }
        });

        // 4. Process Movement (MOVE)
        allOrders.filter(o => o.order_type === 'MOVE').forEach(o => {
            const source = localTerrs.find(x => x.id === o.territory_id);
            const target = localTerrs.find(x => x.id === o.target_id);
            if (source && target && source.owner_id === target.owner_id) {
                target.troops += source.troops;
                target.tanks += source.tanks;
                source.troops = 0;
                source.tanks = 0;
                log.innerHTML += `<div class="log-entry log-move">SECTOR ${source.id} -> ${target.id}: Units relocated.</div>`;
            }
        });

        // 5. Process Combat (ATTACK)
        allOrders.filter(o => o.order_type === 'ATTACK').forEach(o => {
            const source = localTerrs.find(x => x.id === o.territory_id);
            const target = localTerrs.find(x => x.id === o.target_id);
            if (source && target && source.owner_id !== target.owner_id) {
                let atkPower = (source.tanks * 5) + (source.troops * 1);
                if (target.type === 'Plains') atkPower *= 2; 

                let defPower = (target.tanks * 2) + (target.troops * 1) + target.fortifications;
                if (target.type === 'Mountains' || target.type === 'Cities') defPower *= 2; 

                log.innerHTML += `<div class="log-entry log-combat">BATTLE: SECTOR ${source.id} vs SECTOR ${target.id}</div>`;

                if (atkPower > defPower) {
                    const lossRatio = defPower / (atkPower || 1);
                    target.owner_id = source.owner_id;
                    target.troops = Math.floor(source.troops * (1 - lossRatio));
                    target.tanks = Math.floor(source.tanks * (1 - lossRatio));
                    source.troops = 0;
                    source.tanks = 0;
                    log.innerHTML += `<div class="log-entry log-combat">SECTOR ${target.id} CAPTURED.</div>`;
                } else {
                    const lossRatio = atkPower / (defPower || 1);
                    target.troops = Math.floor(target.troops * (1 - lossRatio / 2));
                    target.tanks = Math.floor(target.tanks * (1 - lossRatio / 2));
                    source.troops = 0;
                    source.tanks = 0;
                    log.innerHTML += `<div class="log-entry">OFFENSIVE REPELLED.</div>`;
                }
            }
        });
    }

    // 6. Update Database
    for (const t of localTerrs) {
        await _supabase.from('territories').update({
            owner_id: t.owner_id,
            troops: t.troops,
            tanks: t.tanks,
            fortifications: t.fortifications
        }).eq('id', t.id);
    }

    await _supabase.from('nation_orders').update({ resolved: true }).eq('day', targetDay);

    log.innerHTML += `<div class="log-entry">--- RESOLUTION COMPLETE ---</div>`;
    loadGameState();
    
    if (currentDay > targetDay) resolveTurn(targetDay + 1);
}

document.addEventListener('DOMContentLoaded', init);
