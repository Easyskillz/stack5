const Stack5 = (() => {
  const state = {};

  const T = {
    en:{
      play:'Play', teams:'Find a Team', players:'Find Players', matches:'Matches',
      rankings:'Rankings', login:'Sign in with Steam',
      profile:'My Profile', myTeam:'My Team', logout:'Logout',
      view:'View', join:'Request to Join', invite:'Invite', challenge:'Challenge',
      trust:'Trust', reliability:'Reliability', teamplay:'Teamplay',
      search:'Search...', noResults:'Nothing available right now.'
    },
  };

  function tr(k){ return T.en[k] || k; }   // English only for now; T keeps labels in one place

  async function get(url, options={}){
    const r=await fetch(url,options);
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  // Flags are self-hosted SVGs (public/flags, from flag-icons): emoji flags don't render on Windows.
  const FLAG_CODES=new Set('ma dz tn ly eg fr es de gb it be nl pt us ca br ar cl au nz jp kr sg my th sa ae il za ng tr ru'.split(' '));
  function countryFlag(code){
    const c=String(code||'').toLowerCase();
    return FLAG_CODES.has(c)?`<img class="flag" src="/flags/${c}.svg" alt="${esc(c.toUpperCase())}" title="${esc(c.toUpperCase())}">`:'';
  }
  const LANG_FLAG={EN:'gb',FR:'fr',ES:'es',DE:'de',PT:'pt',IT:'it',NL:'nl',TR:'tr',RU:'ru'};
  function languageFlag(code){
    const c=String(code||'').toUpperCase();
    if(!c) return '';
    const name=(LANGS.find(l=>l[0]===c)||[c,c])[1];
    return LANG_FLAG[c]
      ?`<img class="flag flag-lang" src="/flags/${LANG_FLAG[c]}.svg" alt="${esc(c)}" title="Speaks ${esc(name)}">`
      :`<span class="lang-chip" title="Speaks ${esc(name)}">${esc(c)}</span>`;   // e.g. Arabic: no single country flag
  }
  const flags=(country,language)=>`<span class="flags">${countryFlag(country)}${languageFlag(language)}</span>`;
  // A team's country/language = the most common one among its players.
  const mostCommon=(list,k)=>{ const c={}; for(const p of list||[]) if(p[k]) c[p[k]]=(c[p[k]]||0)+1; return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||null; };

  function header(active=''){
    return `
      <header class="header">
        <a class="logo" href="/">STACK<span>5</span></a>

        <nav class="nav">
          <a class="${active==='play'?'active':''}" href="/play">${tr('play')}</a>
          <a class="${active==='teams'?'active':''}" href="/teams">${tr('teams')}</a>
          <a class="${active==='players'?'active':''}" href="/players">${tr('players')}</a>
          <a class="${active==='matches'?'active':''}" href="/matches">${tr('matches')}</a>
          <a class="${active==='rankings'?'active':''}" href="/rankings">${tr('rankings')}</a>
          <a class="${active==='guide'?'active':''}" href="/guide">How it works</a>
        </nav>

        <div class="header-right" id="header-right">
          <a class="btn btn-green btn-small" href="/login">${tr('login')}</a>
        </div>
      </header>`;
  }

  async function refreshHeaderAuth(){
    const headerRight = document.getElementById('header-right');
    if(!headerRight) return;

    try {
      const response = await fetch('/api/me', {
        credentials: 'include'
      });

      if(!response.ok) return;

      const data = await response.json();

      if(!data.account) return;

      window.Stack5CurrentAccount = data.account;
      state.csrf = data.csrf_token;

      headerRight.innerHTML = `

        <a
          class="header-user"
          href="/player/${encodeURIComponent(data.player?.display_name || data.account.username)}"
        >
          ${esc(data.account.username)}
        </a>

        <button
          class="btn btn-dark btn-small"
          onclick="Stack5.logout()"
        >
          Logout
        </button>
      `;

    } catch(error) {
      console.error('[STACK5 HEADER AUTH]', error);
    }
  }


  function footer(){
    return `<footer><div style="max-width:1180px;margin:auto">STACK5 · Build. Match. Play. · <a href="/guide">How it works</a> · <a href="/contact">Contact</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></div></footer>`;
  }

  function layout(title,content,active=''){
    document.title=`${title} · STACK5`;
    document.body.innerHTML=header(active)+`<main>${content}</main>`+footer();
    refreshHeaderAuth();
  }

  async function teams(){
    layout(tr('teams'),`
      <div class="container">
        <div class="eyebrow">STACK5 MARKETPLACE</div>
        <h1>${tr('teams')}</h1>
        <p class="subtitle">Browse teams looking for players and choose the one that fits you.</p>
        <div class="filters">
          <input id="q" placeholder="${tr('search')}">
          <select id="region"><option value="">Region</option><option>EU</option><option>NA</option><option>SA</option><option>LATAM</option><option>ASIA</option><option>SEA</option><option>OCE</option><option>MENA</option><option>NAFR</option><option>AFRICA</option></select>
          <select id="role"><option value="">Role</option><option>AWPer</option><option>Rifler</option><option>Entry</option><option>IGL</option><option>Support</option></select>
        </div>
        <div id="results" class="grid"><div class="empty">Loading...</div></div>
      </div>`,`teams`);

    async function load(){
      const data=await get('/api/discover/teams');
      const q=(document.getElementById('q').value||'').toLowerCase();
      const region=document.getElementById('region').value;
      let rows=data.filter(t=>
        (!q || t.name.toLowerCase().includes(q)) &&
        (!region || t.region===region)
      );
      document.getElementById('results').innerHTML=rows.length?rows.map(t=>`
        <article class="card">
          <div class="card-top">
            <div>
              <h3>${esc(t.name)}</h3>
              <div class="muted small">${esc(t.region)} · ${t.count}/5 players</div>
            </div>
            <span class="badge">OPEN</span>
          </div>
          <div class="meta">
            <span>FACEIT ${t.min_level}–${t.max_level}</span>
            <span>${esc(t.language||'—')}</span>
          </div>
          <div class="card-actions">
            <a class="btn btn-dark btn-small" href="/team/${t.id}">${tr('view')}</a>
            <button class="btn btn-green btn-small" onclick="Stack5.requestJoin(${Number(t.id)},this)">${tr('join')}</button>
          </div>
        </article>`).join(''):`<div class="empty" style="grid-column:1/-1">${tr('noResults')}</div>`;
    }
    document.querySelectorAll('.filters input,.filters select').forEach(x=>x.addEventListener('input',load));
    load();
  }

  async function players(){
    layout(tr('players'),`
      <div class="container">
        <div class="eyebrow">STACK5 MARKETPLACE</div>
        <h1>${tr('players')}</h1>
        <p class="subtitle">Browse available players and discover teammates based on role, level and reputation.</p>
        <div class="filters">
          <input id="q" placeholder="${tr('search')}">
          <select id="region"><option value="">Region</option><option>EU</option><option>NA</option><option>SA</option><option>LATAM</option><option>ASIA</option><option>SEA</option><option>OCE</option><option>MENA</option><option>NAFR</option><option>AFRICA</option></select>
          <select id="role"><option value="">Role</option><option>AWPer</option><option>Rifler</option><option>Entry</option><option>IGL</option><option>Support</option></select>
        </div>
        <div id="results" class="grid"><div class="empty">Loading...</div></div>
      </div>`,`players`);

    async function load(){
      const data=await get('/api/players');
      const q=(document.getElementById('q').value||'').toLowerCase();
      const region=document.getElementById('region').value;
      const role=document.getElementById('role').value;
      let rows=data.filter(p=>
        (!q || String(p.display_name||'').toLowerCase().includes(q)) &&
        (!region || p.region===region) &&
        (!role || p.role===role) &&
        (p.availability===undefined || p.availability!=='Unavailable')
      );
      document.getElementById('results').innerHTML=rows.length?rows.map(p=>`
        <article class="card">
          <div class="profile-head">
            <img class="avatar" src="${esc(p.avatar_url||'')}" onerror="this.style.display='none'">
            <div>
              <h3>${esc(p.display_name||'Player')}</h3>
              <div class="muted small">${countryFlag(p.country)} ${esc(p.country||'')} · ${esc(p.region||'')}</div>
            </div>
          </div>
          <div class="meta">
            <span>FACEIT ${p.faceit_level??'—'}</span>
            <span>${esc(p.role||'—')}</span>
          </div>
          <div class="meta">
            <span>${tr('trust')} <strong>${p.trust_score??'—'}</strong>${p.trust_confidence==='NEW'?' <span class="muted">(new)</span>':''}</span>
            <span>${tr('reliability')} ${p.reliability_score??'—'}</span>
            ${p.faceit_verified?'<span class="status green">FACEIT ✓</span>':''}
            ${p.eligible?'<span class="status green">VERIFIED</span>':'<span class="status">Not verified</span>'}
          </div>
          <div class="card-actions">
            <a class="btn btn-dark btn-small" href="/player/${encodeURIComponent(p.display_name)}">${tr('view')}</a>
            <button class="btn btn-green btn-small" onclick="Stack5.invitePlayer(${Number(p.id)},this)">${tr('invite')}</button>
          </div>
        </article>`).join(''):`<div class="empty" style="grid-column:1/-1">${tr('noResults')}</div>`;
    }
    document.querySelectorAll('.filters input,.filters select').forEach(x=>x.addEventListener('input',load));
    load();
  }

  async function playerProfile(username){
    const players=await get('/api/players');
    const p=players.find(x=>String(x.display_name).toLowerCase()===username.toLowerCase());
    if(!p){layout('Player not found',`<div class="container"><div class="empty">Player not found.</div></div>`);return;}
    layout(p.display_name,`
      <div class="container">
        <div class="player-card">
          <div class="profile-head">
            <img class="avatar" src="${esc(p.avatar_url||'')}" onerror="this.style.display='none'">
            <div>
              <div class="eyebrow">STACK5 PLAYER</div>
              <h1 style="font-size:38px;margin:5px 0">${esc(p.display_name)}</h1>
              <div class="muted">${countryFlag(p.country)} ${esc(p.country||'')} · ${esc(p.region||'')} · ${esc(p.role||'')}</div>
              <div class="meta">${p.steam_verified?'<span class="status green">STEAM VERIFIED</span>':'<span class="status">Steam not verified</span>'}${p.eligible?'<span class="status green">MEETS REQUIREMENTS</span>':''}</div>
            </div>
          </div>
          <div id="trust-box"><div class="empty">Loading trust score…</div></div>
          <div class="detail-grid">
            <div class="detail"><label>FACEIT Level ${p.faceit_verified?'<span class="status green">VERIFIED</span>':'<span class="muted small">(self-reported)</span>'}</label><strong>${p.faceit_level??'—'}</strong></div>
            <div class="detail"><label>FACEIT ELO</label><strong>${p.faceit_elo||'—'}</strong></div>
            <div class="detail"><label>Role</label><strong>${esc(p.role||'—')}</strong></div>
            <div class="detail"><label>Language</label><strong>${esc(p.language||'—')}</strong></div>
          </div>
          ${realSteam(p)?`<div class="actions"><a class="btn btn-dark" href="${esc(p.steam_url)}" target="_blank" rel="noopener">View Steam profile</a></div>`:''}
          <div id="leetify-box"></div>
          <div id="faceit-box"></div>
        </div>
      </div>`);

    get(`/api/players/${p.id}/trust`).then(t=>{
      const box=document.getElementById('trust-box'); if(box) box.innerHTML=trustPanel(t);
    }).catch(()=>{ const box=document.getElementById('trust-box'); if(box) box.innerHTML=''; });
    get(`/api/players/${p.id}/leetify`).then(l=>{
      const box=document.getElementById('leetify-box'); if(box && l.available) box.innerHTML=leetifyPanel(l);
    }).catch(()=>{});
    get(`/api/players/${p.id}/faceit`).then(f=>{
      const box=document.getElementById('faceit-box'); if(box && f.available) box.innerHTML=faceitPanel(f);
    }).catch(()=>{});
  }

  const CONFIDENCE={NEW:['New player','Not much data yet — this score will settle as they play.'],BUILDING:['Building','Some history on record.'],ESTABLISHED:['Established','Backed by solid history.']};
  const PART_LABELS={identity:['Identity','Steam account history'],peer:['Peer reputation','Ratings from players they actually played with'],reliability:['Reliability','Accepting matches, not abandoning teams'],record:['Track record','Confirmed matches on STACK5']};

  function trustPanel(t){
    const [confLabel,confText]=CONFIDENCE[t.confidence]||CONFIDENCE.NEW;
    const color=t.total>=70?'var(--green)':t.total>=40?'#f2c94c':'var(--danger)';
    const part=(key)=>{
      const v=t.parts[key], [label,desc]=PART_LABELS[key];
      const detail=key==='identity'?(v.notes||[]).join(' · '):key==='peer'?(v.ratings?`${v.ratings} rating${v.ratings>1?'s':''}, avg ${v.avg}★`:'No ratings yet'):key==='reliability'?(v.incidents?`${v.incidents} recent incident(s)`:'No incidents'):`${v.matches} match${v.matches===1?'':'es'}`;
      return `<div class="trust-part">
        <div class="trust-part-head"><span><strong>${label}</strong> <span class="muted small">${Math.round(v.weight*100)}%</span></span><strong>${v.score}</strong></div>
        <div class="bar"><span style="width:${Math.max(2,v.score)}%"></span></div>
        <div class="muted small" title="${esc(desc)}">${esc(detail||desc)}</div>
      </div>`;
    };
    return `<div class="trust-panel">
      <div class="trust-head">
        <div><div class="stat-label">STACK5 Trust Score</div><div class="trust-total" style="color:${color}">${t.total}</div></div>
        <div style="text-align:right"><span class="status ${t.confidence==='ESTABLISHED'?'green':t.confidence==='BUILDING'?'amber':''}">${confLabel}</span><div class="muted small" style="margin-top:6px;max-width:260px">${confText}</div></div>
      </div>
      ${t.flags?.length?`<div class="trust-flags">${t.flags.map(f=>`<div>⚠️ ${esc(f)}</div>`).join('')}</div>`:''}
      <div class="trust-parts">${['identity','peer','reliability','record'].map(part).join('')}</div>
      <p class="muted small" style="margin:14px 0 0">STACK5 is a reputation layer, not an anti-cheat. Scores combine public Steam data with STACK5 match history and ratings.</p>
    </div>`;
  }

  // Leetify's guidelines: show their metrics unmodified, with "Data Provided by Leetify" and a link back.
  function leetifyPanel(l){
    const fmt=(v,d=0)=>v==null?'—':Number(v).toFixed(d);
    const cells=[['Leetify Rating',l.leetify_rating==null?'—':(l.leetify_rating>0?'+':'')+fmt(l.leetify_rating,2)],['Premier',l.premier?Number(l.premier).toLocaleString():'—'],['Aim',fmt(l.aim)],['Positioning',fmt(l.positioning)],['Utility',fmt(l.utility)],['Matches',l.total_matches??'—']];
    return `<div class="leetify-panel">
      <div class="trust-head"><h3 style="margin:0">CS2 stats</h3>
        <a class="leetify-attr" href="https://leetify.com/" target="_blank" rel="noopener">Data Provided by Leetify</a></div>
      <div class="detail-grid" style="grid-template-columns:repeat(3,1fr)">${cells.map(([k,v])=>`<div class="detail"><label>${k}</label><strong>${v}</strong></div>`).join('')}</div>
      <a class="leetify-link" href="${esc(l.url)}" target="_blank" rel="noopener">View on Leetify</a>
    </div>`;
  }

  // FACEIT data is shown live and unmodified (never stored or scored), with a link back. No endorsement implied.
  function faceitPanel(f){
    const head=`<div class="trust-head"><h3 style="margin:0">FACEIT</h3><span class="leetify-attr">Live data from FACEIT</span></div>`;
    if(f.none) return `<div class="leetify-panel">${head}<p class="muted" style="margin:12px 0 0">No FACEIT account linked to this Steam account.</p></div>`;
    const since=f.member_since?new Date(f.member_since).toLocaleDateString(undefined,{year:'numeric',month:'short'}):'—';
    const active=(f.bans||[]).filter(b=>b.active);
    const cells=[['Level',f.level??'—'],['Elo',f.elo!=null?Number(f.elo).toLocaleString():'—'],['Matches',f.matches!=null?Number(f.matches).toLocaleString():'—'],['Member since',since],['Bans',(f.bans||[]).length?`${f.bans.length}${active.length?` (${active.length} active)`:''}`:'None'],['Nickname',esc(f.nickname)]];
    return `<div class="leetify-panel">${head}
      ${active.length?`<div class="trust-flags">${active.map(b=>`<div>⚠️ Active FACEIT ban: ${esc(b.reason)}</div>`).join('')}</div>`:''}
      <div class="detail-grid" style="grid-template-columns:repeat(3,1fr)">${cells.map(([k,v])=>`<div class="detail"><label>${k}</label><strong>${v}</strong></div>`).join('')}</div>
      <a class="leetify-link" style="color:#FF5500" href="${esc(f.url)}" target="_blank" rel="noopener">View on FACEIT</a>
    </div>`;
  }

  async function home(){
    const features=[
      ['🛡️','Trusted player identity','Every account is a real Steam account, proven by signing in through Steam. No throwaway sign-ups.'],
      ['⭐','Reputation, not just Elo','Keep skill separate from reliability, teamplay, communication and conduct signals.'],
      ['🎯','Team-based matchmaking','Build your five, enter the queue and find another complete team at a comparable level.'],
      ['🔎','Verification layers','Steam ownership, account age, CS2 hours and ban checks before anyone can queue.'],
      ['🌍','Regional matchmaking','A global regional structure designed to connect players and teams with competitive matches worldwide.'],
      ['🔐','Steam-safe by design','STACK5 never needs your Steam password, Steam Guard code, trade URL or inventory access.']
    ];
    const steps=[
      ['Sign in with Steam','On Steam’s own website, then pick a username.'],
      ['Complete profile','Country, region, level, role and language.'],
      ['Build your five','Invite friends or find missing players.'],
      ['Find your match','Enter the 5v5 queue and meet a comparable team.'],
      ['Ready & play','Both teams confirm before the match.']
    ];
    layout('Build. Match. Play.',`
      <section class="hero">
        <div class="eyebrow">CS2 TEAM MATCHMAKING · PRIVATE BETA</div>
        <h1>Tired of cheaters?<br><span>Find a trusted five.</span></h1>
        <p class="subtitle">STACK5 is built for CS2 players who want a more trusted 5v5 experience — with player identity, reputation and team-based matchmaking at the core.</p>
        <div class="actions">
          <a class="btn btn-green" href="/login" data-guest-cta>Sign in with Steam</a>
          <a class="btn btn-dark" href="/guide">How STACK5 works</a>
          <a class="btn btn-dark" href="/teams">${tr('teams')}</a>
        </div>
        ${liveStatsBox()}
        <div class="notice">⚠️ <strong>STACK5 is currently in BETA.</strong> Features, verification layers, data sources and matchmaking rules may change during testing.</div>
      </section>

      <div class="container" style="padding-top:10px">
        <div class="problem">
          <div>
            <h2>Built around the problem players actually feel.</h2>
            <p>Random opponents, anonymous profiles and unreliable teammates can ruin a 5v5 session. STACK5 is designed to put more context around the people and teams you play with.</p>
            <p class="security-note"><strong>Important:</strong> STACK5 is not an anti-cheat and does not claim to guarantee that a player is cheat-free. It is a trusted matchmaking and reputation layer.</p>
          </div>
          <div class="pill-list">
            <div class="pill">🛡️ <b>Identity</b> — real STACK5 account + player profile</div>
            <div class="pill">⭐ <b>Reputation</b> — reliability and teamplay tracked separately from skill</div>
            <div class="pill">⚔️ <b>Teams first</b> — complete five vs complete five</div>
            <div class="pill">🔐 <b>Steam-safe</b> — never ask for your Steam password</div>
          </div>
        </div>

        <div class="section">
          <h2>The STACK5 difference</h2>
          <div class="section-lead">The platform is designed around trust without pretending that one number can tell you everything about a player.</div>
          <div class="grid">${features.map(([icon,title,text])=>`
            <div class="card"><div class="feature-icon">${icon}</div><h3>${title}</h3><p>${text}</p></div>`).join('')}
          </div>
        </div>

        <div class="section" id="how">
          <h2>From account to match</h2>
          <div class="steps" style="margin-top:20px">${steps.map(([title,text],i)=>`
            <div class="step"><div class="step-num">0${i+1}</div><h3>${title}</h3><p>${text}</p></div>`).join('')}
          </div>
        </div>

        <div class="section">
          <h2>STACK5 regions</h2>
          <div class="section-lead">A global regional matchmaking structure designed to connect players and teams worldwide.</div>
          <div id="home-regions" class="region-grid"></div>
        </div>

        <div class="section">
          <div class="cta">
            <h2>Your five is waiting.</h2>
            <p>Build your identity. Find your team. Find your match.</p>
            <div class="actions"><a class="btn btn-green" href="/login" data-guest-cta>Sign in with Steam</a></div>
          </div>
        </div>
      </div>`);

    fillLiveStats();
    catalog().then(cat=>{
      const box=document.getElementById('home-regions');
      if(box) box.innerHTML=cat.regions.map(r=>`
        <div class="region${r.id==='NAFR'?' featured':''}"><span style="font-size:22px">${r.flag}</span><strong>${esc(r.name)}</strong><small class="muted">${r.id==='NAFR'?'STACK5 custom region':'Matchmaking region'}</small></div>`).join('');
    }).catch(()=>{});

    // Signed-in visitors get "Go to Play" instead of sign-up buttons.
    fetch('/api/me',{credentials:'include'}).then(r=>{
      if(!r.ok) return;
      document.querySelectorAll('[data-guest-cta]').forEach(a=>{ a.href='/play'; a.textContent='Go to Play'; });
    }).catch(()=>{});
  }

  // ---------- Live counters ----------
  const liveStatsBox=()=>`<div class="live-stats" data-live-stats><span class="muted small">Loading live activity…</span></div>`;
  async function fillLiveStats(){
    const els=document.querySelectorAll('[data-live-stats]');
    if(!els.length) return;
    try{
      const s=await get('/api/stats/live');
      const item=(n,one,many)=>`<span><strong>${n}</strong> ${n===1?one:many}</span>`;
      els.forEach(el=>el.innerHTML=`<span class="live-dot"></span>${item(s.online,'player online','players online')}${item(s.queued_teams,'team looking for a match','teams looking for a match')}${item(s.recruiting_teams,'team recruiting','teams recruiting')}${item(s.live_matches,'match live','matches live')}`);
    }catch{ els.forEach(el=>el.remove()); }
  }

  // ---------- Player guide ----------
  const GUIDE_STEPS=[
    ['1-sign-in',496,434,'Sign in with Steam','Click <strong>Sign in with Steam</strong>. You log in on Steam’s own website: check the address bar says <code>steamcommunity.com</code>. STACK5 only receives your public SteamID. It never sees your password and can’t touch your inventory or trades.'],
    ['2-pick-username',436,366,'Pick your username','First time only: choose a STACK5 username. Email is optional (for match notifications). Confirm you’re 16 or older and accept the Terms.'],
    ['3-profile-setup',784,686,'Set up your player profile','Country (this sets your matchmaking region), FACEIT level, main role and language. Teams see this when they look for players.'],
    ['4-build-team',1076,540,'Build your five','Create a team and invite players by their STACK5 username, or find them on <a href="/players">Find Players</a>. Prefer joining a team? Browse <a href="/teams">Find a Team</a> and ask to join. An open team disbands after 6 hours without a new player.'],
    ['5-full-team-queue',715,538,'Five players? Find a match','When your team has 5 players, the captain clicks <strong>Find match</strong>. Everyone must meet the STACK5 requirements: Steam account at least 2 years old, 500+ hours of CS2, no recent VAC or game ban.'],
    ['6-searching',705,576,'Searching for an opponent','STACK5 looks for another full team in your region at a similar level. This runs every 30 seconds. After 2 hours without a match, your team leaves the queue.'],
    ['7-match-found',1061,551,'Match found: captains accept','Both captains have <strong>5 minutes</strong> to accept. Declining or letting the time run out counts against the captain’s reliability.'],
    ['8-match-room',1061,1046,'Play through CS2 Private Matchmaking','Each captain invites their 4 teammates to a <strong>CS2 party</strong> (use the Steam buttons). One captain creates a <em>Private Matchmaking Pool</em> in CS2 and pastes the code here. The other captain enters it with <em>Manually Enter a Code</em>. Both parties press <strong>GO</strong>. Optional: a captain can share a Discord voice channel that only their own team sees.'],
    ['9-result-and-ratings',1061,512,'Report the score, then rate everyone','After the game, both captains report the score. When they match, the result is final and everyone can rate the players they played with, teammates and opponents. Different scores go to an admin.'],
    ['10-trust-score',1076,303,'Build your Trust Score','Your Trust Score (0–100) combines your Steam history, ratings from people you played with, reliability and matches played. It’s public on your profile and helps teams decide who to play with.']
  ];
  const GUIDE_FAQ=[
    ['Is signing in with Steam safe?','Yes. You sign in on steamcommunity.com, never on STACK5. We only receive your public SteamID. STACK5 will never ask for your Steam Guard code, an API key or your trade link. If a page asks for those, it isn’t us.'],
    ['Why can’t I play yet?','Your Steam profile and game details must be public so we can check the requirements (2+ year old account, 500+ hours of CS2, no VAC or game ban in the last 2 years). The Play page shows which check is missing. After changing your Steam privacy, wait a few minutes and click Check again.'],
    ['Does it cost anything?','No. STACK5 is free during the beta.'],
    ['Does a STACK5 match change my CS Rating?','No. CS2 Private Matchmaking is unrated in CS2. STACK5 keeps its own results and Trust Score.'],
    ['What if the other team doesn’t show up, or the captains disagree?','If only one captain reports a score within 6 hours, that score counts. If the scores don’t match, an admin decides. You can also <a href="/contact">contact us</a> with details.'],
    ['How do I report a cheater?','Use the <a href="/contact">Contact page</a> (topic: Report a player) with their STACK5 name and the match. STACK5 is a reputation layer, not an anti-cheat.']
  ];
  function guidePage(){
    layout('How STACK5 works',`<div class="container guide">
      <div class="eyebrow">PLAYER GUIDE</div><h1>How STACK5 works</h1>
      <p class="subtitle">From signing in to your first match, step by step. Getting set up takes about 5 minutes.</p>
      <nav class="guide-toc" aria-label="Steps">${GUIDE_STEPS.map(([,,,t],i)=>`<a href="#step-${i+1}">${i+1}. ${esc(t)}</a>`).join('')}<a href="#faq">Questions</a></nav>
      ${GUIDE_STEPS.map(([id,w,h,t,text],i)=>`<section class="guide-step" id="step-${i+1}">
        <div class="guide-text"><div class="step-num">STEP ${i+1}</div><h2>${esc(t)}</h2><p>${text}</p></div>
        <figure><img src="/img/guide/${id}.webp" width="${w}" height="${h}" loading="${i<2?'eager':'lazy'}" alt="${esc(t)}: screenshot of STACK5"><figcaption class="muted small">Example players and teams.</figcaption></figure>
      </section>`).join('')}
      <section class="panel" id="faq" style="margin-top:28px"><h2>Questions</h2>${GUIDE_FAQ.map(([q,a])=>`<details class="faq"><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</section>
      <div class="cta" style="margin-top:24px"><h2>Ready?</h2><p>Sign in, set up your profile and build your five.</p><div class="actions"><a class="btn btn-green" href="/login" data-guest-cta>Sign in with Steam</a></div></div>
    </div>`,'guide');
  }

  // ---------- Contact page ----------
  async function contactPage(){
    layout('Contact',`<div class="container" style="max-width:760px">
      <div class="eyebrow">CONTACT</div><h1>Contact STACK5</h1>
      <p class="subtitle">Questions, problems or ideas: we read every message.</p>
      <div class="panel">
        <div class="code-box"><div><div class="muted small">Email us</div><code id="contact-email">contact@stack5cs.com</code></div><button class="btn btn-small btn-green" type="button" id="copy-email">Copy</button></div>
        <ul class="contact-topics">
          <li><strong>Help with your account</strong>: sign-in, profile, Steam checks</li>
          <li><strong>Report a player</strong>: cheating, smurfing, abuse. Include their STACK5 name and the match.</li>
          <li><strong>Disputed match result</strong>: tell us the match and the real score</li>
          <li><strong>Partnerships and sponsoring</strong>: creators, communities, brands</li>
          <li><strong>Your data</strong>: a copy of it or a correction. You can delete your account yourself on the <a href="/account" style="color:var(--green)">Account page</a>.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Send a message</h2>
        <form id="contact-form" class="form-grid">
          <div><label for="contact-topic">What's it about?</label><select id="contact-topic" name="topic" required></select></div>
          <div><label for="contact-reply">Your email (to get a reply)</label><input class="input" id="contact-reply" name="email" type="email" placeholder="you@example.com" autocomplete="email"></div>
          <div class="full"><label for="contact-message">Message</label><textarea class="input" id="contact-message" name="message" rows="6" minlength="10" maxlength="4000" required placeholder="What happened, and what can we do?"></textarea></div>
          <div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
          <div class="full"><button class="btn btn-green">Send message</button> <span class="muted small" style="margin-left:8px">Signed in? We'll see your STACK5 username, so you don't need to explain who you are.</span></div>
        </form>
      </div></div>`);
    const info=await get('/api/contact/info').catch(()=>null);
    if(info){ document.getElementById('contact-email').textContent=info.email; document.getElementById('contact-topic').innerHTML=info.topics.map(t=>`<option>${esc(t)}</option>`).join(''); }
    document.getElementById('copy-email').onclick=()=>ACTIONS['copy-code'](null,document.getElementById('contact-email').textContent).then(()=>toast('Email address copied.'));
    const form=document.getElementById('contact-form');
    form.onsubmit=async e=>{
      e.preventDefault();
      const b=form.querySelector('button'); b.disabled=true;
      try{ const r=await post('/api/contact',Object.fromEntries(new FormData(form))); toast(r.message); form.reset(); }
      catch(err){ toast(err.message,true); }
      b.disabled=false;
    };
  }

  // ---------- Matches page ----------
  async function matchesPage(){
    layout('Matches',`<div class="container"><div class="eyebrow">MATCHES</div><h1>Matches</h1>${liveStatsBox()}<div id="matches"><div class="empty">Loading...</div></div></div>`,'matches');
    fillLiveStats();
    const box=document.getElementById('matches');
    const d=await get('/api/matches').catch(()=>({live:[],recent:[]}));
    const side=(t,right)=>t?`<a class="match-team${right?' right':''}" href="/team/${t.id}">${right?`<strong>${esc(t.name)}</strong> ${flags(t.country,t.language)}`:`${flags(t.country,t.language)} <strong>${esc(t.name)}</strong>`}</a>`:'<span class="muted">—</span>';
    const ago=ts=>{ if(!ts) return ''; const m=Math.round((Date.now()-ts)/60000); return m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`; };
    const row=(m,live)=>`<div class="match-row">${side(m.team_a)}<div class="match-mid">${live?'<span class="status green">LIVE</span>':`<span class="score">${m.score_a} – ${m.score_b}</span>`}<div class="muted small">${live?'Started '+ago(m.confirmed_at):ago(m.completed_at)}</div></div>${side(m.team_b,true)}</div>`;
    box.innerHTML=`<div class="panel"><h2>Live now</h2>${d.live.length?d.live.map(m=>row(m,true)).join(''):'<p class="muted">No match is being played right now.</p>'}</div>
      <div class="panel"><h2>Recent results</h2>${d.recent.length?d.recent.map(m=>row(m,false)).join(''):'<p class="muted">No finished matches yet.</p>'}</div>`;
  }

  // ---------- API helpers ----------
  async function csrfToken(){
    if(state.csrf) return state.csrf;
    const r=await fetch('/api/me',{credentials:'include'});
    if(r.ok){ state.csrf=(await r.json()).csrf_token; }
    return state.csrf;
  }

  async function post(url, body={}){
    const token=await csrfToken();
    return get(url,{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json',...(token?{'X-CSRF-Token':token}:{})},
      body:JSON.stringify(body)
    });
  }

  let catalogPromise=null;
  function catalog(){ return catalogPromise ||= get('/api/regions'); }

  function toast(text, bad=false){
    document.querySelector('.toast')?.remove();
    const t=document.createElement('div');
    t.className='toast'+(bad?' bad':'');
    t.textContent=text;
    document.body.appendChild(t);
    setTimeout(()=>t.remove(),4000);
  }

  const STATUS={
    OPEN:['Building roster',''], READY:['In queue','amber'], MATCHED:['Match found','green'],
    MATCH_CONFIRMED:['In a live match','green'], FINISHED:['Finished',''], CANCELLED:['Disbanded','']
  };
  function statusBadge(s){ const [label,cls]=STATUS[s]||[s,'']; return `<span class="status ${cls}">${esc(label)}</span>`; }
  const ROLES=['Rifler','AWPer','Entry','IGL','Support','Lurker'];
  const LANGS=[['EN','English'],['FR','Français'],['AR','العربية'],['ES','Español'],['DE','Deutsch'],['PT','Português'],['IT','Italiano'],['NL','Nederlands'],['TR','Türkçe'],['RU','Русский']];
  const btn=(label,act,cls='btn-dark',data={})=>`<button class="btn btn-small ${cls}" data-act="${act}" ${Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}</button>`;
  const realSteam=p=>/^https:\/\/(www\.)?steamcommunity\.com\//.test(p?.steam_url||'');
  const playerLink=p=>`<a href="/player/${encodeURIComponent(p.display_name)}"><strong>${esc(p.display_name)}</strong></a>`;

  // ---------- Play hub ----------
  let pollTimer=null;

  async function play(){
    layout('Play',`
      <div class="container">
        <div class="eyebrow">PLAY</div>
        <h1>Find your match.</h1>
        ${liveStatsBox()}
        <div id="play"><div class="empty">Loading...</div></div>
      </div>`,'play');
    const box=document.getElementById('play');
    box.addEventListener('click',onAction);
    box.addEventListener('submit',onForm);
    // Result of "Sign in through Steam".
    const qs=new URLSearchParams(location.search);
    if(qs.get('steam')==='linked') toast('Steam account verified ✓');
    if(qs.get('steam')==='error') toast(qs.get('reason')||'Steam sign-in failed.',true);
    if(qs.has('steam')) history.replaceState(null,'','/play');
    fillLiveStats();
    await renderPlay();
  }

  async function renderPlay(){
    clearTimeout(pollTimer);
    const box=document.getElementById('play');
    if(!box) return;
    const r=await fetch('/api/my/dashboard',{credentials:'include'});
    if(r.status===401){
      box.innerHTML=`<div class="panel" style="max-width:560px">
        <h2>Sign in to play</h2>
        <p class="muted">Sign in through Steam, set up your player profile and build your five. New here? Read <a href="/guide" style="color:var(--green)">how STACK5 works</a>.</p>
        <div class="actions" style="margin-top:16px"><a class="btn btn-green" href="/login">Sign in with Steam</a></div>
      </div>`;
      return;
    }
    const d=await r.json();
    if(!d.player) return renderSetup(box,d);
    state.clockSkew=(d.now||Date.now())-Date.now();

    const blocked=d.eligibility && !d.eligibility.eligible;
    box.innerHTML=matchPanel(d)+`
      <div class="panel-grid">
        <div>${blocked && !d.team ? eligibilityPanel(d.eligibility) : (blocked ? eligibilityPanel(d.eligibility,true) : '') + teamPanel(d)}</div>
        <div>${sidePanel(d)}</div>
      </div>`;
    startCountdowns();

    // Keep the page live while waiting on the queue or the other captain (no text inputs are shown then).
    const waiting=(d.team && d.team.status==='READY') || (d.match && ['PENDING','CONFIRMED','DISPUTED'].includes(d.match.status));
    if(waiting) pollTimer=setTimeout(refreshUnlessTyping,8000);
  }

  // ---------- Eligibility + countdowns ----------
  const steamButton=label=>`<a class="btn btn-steam" href="/auth/steam/start"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15.5" cy="9" r="3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="2.2" fill="currentColor"/><path d="M8.5 15.5 15.5 9" stroke="currentColor" stroke-width="2"/></svg>${esc(label)}</a>`;

  function eligibilityPanel(e, inTeam=false){
    const rows=(e.checks||[]).map(c=>`
      <div class="row"><div><strong>${c.ok?'✅':'❌'} ${esc(c.label)}</strong><div class="muted small">${esc(c.detail||'')}</div></div></div>`).join('');
    return `<div class="panel" style="border-color:#4a3a1e">
      <h2>${inTeam?'Your account no longer meets the requirements':'Verify your Steam account to play'}</h2>
      <p class="muted" style="margin-top:0">To keep new and throwaway accounts out of matches, STACK5 needs a Steam account with real CS2 history. We check public Steam data only. We never need your password.</p>
      <div style="margin-top:10px">${rows}</div>
      <p class="muted small" style="margin-top:14px">Made your profile or game details public? Steam can take a few minutes to update, then check again.
        <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener" style="color:var(--green)">Open Steam privacy settings</a></p>
      <div class="actions" style="margin-top:12px">${(e.checks||[]).some(c=>c.key==='steam_owner'&&!c.ok)?steamButton('Verify with Steam'):''}${btn('Check again','recheck','btn-green')}</div>
    </div>${inTeam?'<div style="height:16px"></div>':''}`;
  }

  function refreshUnlessTyping(){
    const box=document.getElementById('play');
    if(!box) return;
    const typing=[...box.querySelectorAll('input')].some(el=>el===document.activeElement || el.value) || box.contains(document.activeElement) && document.activeElement.tagName==='SELECT';
    if(typing){ pollTimer=setTimeout(refreshUnlessTyping,8000); return; }
    renderPlay();
  }

  function fmtLeft(ms){
    if(ms<=0) return '0:00';
    const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor(s%3600/60), sec=s%60;
    return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m}:${String(sec).padStart(2,'0')}`;
  }
  let countdownTimer=null;
  function startCountdowns(){
    clearInterval(countdownTimer);
    const tick=()=>{
      const els=document.querySelectorAll('[data-deadline]');
      if(!els.length){ clearInterval(countdownTimer); return; }
      const now=Date.now()+(state.clockSkew||0);
      let expired=false;
      els.forEach(el=>{ const left=Number(el.dataset.deadline)-now; el.textContent=fmtLeft(left); if(left<=0) expired=true; });
      if(expired){ clearInterval(countdownTimer); setTimeout(renderPlay,3000); }   // server timers run every 30s
    };
    tick(); countdownTimer=setInterval(tick,1000);
  }
  const countdown=ts=>ts?`<strong data-deadline="${Number(ts)}"></strong>`:'';

  function matchPanel(d){
    const m=d.match;
    if(!m) return '';
    const iAmA=m.my_team_id===m.team_a_id;
    const mine=iAmA?m.team_a:m.team_b, other=iAmA?m.team_b:m.team_a;
    const myAccepted=iAmA?m.accepted_a:m.accepted_b;
    const isCaptain=mine && mine.captain_id===d.player.id;
    const rated=new Set(m.rated||[]);
    // Scores are stored team A first; show them from this player's side.
    const mySide=([a,b])=>iAmA?[a,b]:[b,a];
    const parse=r=>{ const x=/^(\d+)-(\d+)$/.exec(r||''); return x?[Number(x[1]),Number(x[2])]:null; };
    const myReport=parse(iAmA?m.report_a:m.report_b), theirReport=parse(iAmA?m.report_b:m.report_a);

    const teamHead=t=>`<h3>${flags(mostCommon(t?.members,'country'),mostCommon(t?.members,'language'))} ${esc(t?.name)}</h3>`;
    const roster=(t,rate)=>(t?.members||[]).map(p=>`
      <div class="row">
        <div>${flags(p.country,p.language)} ${playerLink(p)}<div class="muted small">FACEIT ${p.faceit_level??'—'} · ${esc(p.role||'—')}${t.captain_id===p.id?' · Captain':''}</div></div>
        <div class="row-actions">
          ${realSteam(p)?`<a class="btn btn-small btn-outline" href="${esc(p.steam_url)}" target="_blank" rel="noopener">Steam</a>`:''}
          ${rate && p.id!==d.player.id?`<select class="rate-select" data-player="${p.id}" style="width:auto;padding:6px"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select>
          ${btn(rated.has(p.id)?'Rated ✓ · change':'Rate','rate',rated.has(p.id)?'btn-outline':'btn-dark',{id:p.id})}`:''}
        </div>
      </div>`).join('');
    const reportForm=label=>`<form data-form="report" data-id="${m.id}" class="score-form">
        <label><span class="muted small">${esc(mine?.name)}</span><input class="input" name="my_score" type="number" inputmode="numeric" min="0" max="60" placeholder="13" required></label>
        <span class="score-dash">–</span>
        <label><span class="muted small">${esc(other?.name)}</span><input class="input" name="their_score" type="number" inputmode="numeric" min="0" max="60" placeholder="9" required></label>
        <button class="btn btn-green btn-small">${label}</button></form>`;

    let head, body='';
    if(m.status==='PENDING'){
      head=`<div class="eyebrow">MATCH FOUND · ${m.compatibility}% COMPATIBLE</div><h2 style="margin-top:8px">${esc(mine?.name)} vs ${esc(other?.name)}</h2>`;
      body=m.expires_at?`<p class="muted" style="margin-top:14px">Both captains must accept within ${countdown(m.expires_at)}. If time runs out, a team that didn't accept goes back to recruiting.</p>`:'';
      if(isCaptain && !myAccepted) body+=`<div class="actions" style="margin-top:12px">${btn('Accept match','accept-match','btn-green',{id:m.id,arg:m.my_team_id})}${btn('Decline','decline-match','btn-danger',{id:m.id,confirm:'Decline this match? Your team will leave the queue.'})}</div>`;
      else if(myAccepted) body+=`<p class="muted" style="margin-top:14px">Your team accepted. Waiting for the other captain…</p>`;
      else body+=`<p class="muted" style="margin-top:14px">Waiting for your captain to accept…</p>`;
    } else if(m.status==='CONFIRMED'){
      head=`<div class="eyebrow">MATCH LIVE</div><h2 style="margin-top:8px">${esc(mine?.name)} vs ${esc(other?.name)}</h2>
        <p class="muted" style="margin-top:0">You play through CS2's own <strong>Private Matchmaking</strong>. Follow these steps:</p>
        <ol class="match-steps">
          <li><strong>Each captain:</strong> invite your 4 teammates to your CS2 party (Steam buttons below). Each team must be <strong>one 5-player party</strong>, or CS2 may mix players between teams.</li>
          <li><strong>One captain hosts:</strong> in CS2, open <em>Play → Matchmaking → Private Matchmaking → Create a Private Matchmaking Pool</em>, copy the full code and paste it below.</li>
          <li><strong>The other captain:</strong> <em>Private Matchmaking → Manually Enter a Code</em>, paste the code.</li>
          <li><strong>Both parties press GO.</strong> The match starts when all 10 players are searching. It's unrated in CS2; STACK5 records the result.</li>
        </ol>
        <p class="muted small" style="margin-top:0">Optional: each captain can share a Discord voice channel for their team below. Only your own team sees it.</p>`;
      const code=m.lobby_code
        ? `<div class="code-box"><div><div class="muted small">Private matchmaking code</div><code>${esc(m.lobby_code)}</code></div>${btn('Copy','copy-code','btn-green',{arg:m.lobby_code})}</div>`
          + (isCaptain?`<details class="muted small" style="margin-top:6px"><summary>Wrong code? Replace it</summary><form data-form="code" data-id="${m.id}" class="inline-form"><input class="input" name="code" placeholder="Paste the new code" required><button class="btn btn-dark btn-small">Replace</button></form></details>`:'')
        : isCaptain
          ? `<form data-form="code" data-id="${m.id}" class="inline-form"><input class="input" name="code" placeholder="Paste the CS2 private matchmaking code" required><button class="btn btn-green btn-small">Post code</button></form>`
          : `<p class="muted">Waiting for a captain to post the private matchmaking code…</p>`;
      const voice=m.my_voice
        ? `<div class="voice-box"><div><div class="muted small">Your team's voice channel</div><strong>Discord</strong> <span class="muted small">· only your team sees this</span></div><a class="btn btn-small btn-discord" href="${esc(m.my_voice)}" target="_blank" rel="noopener noreferrer">Join voice</a></div>`
          + (isCaptain?`<details class="muted small" style="margin-top:6px"><summary>Change or remove the link</summary><form data-form="voice" data-id="${m.id}" class="inline-form"><input class="input" name="link" placeholder="New Discord invite (leave empty to remove)"><button class="btn btn-dark btn-small">Save</button></form></details>`:'')
        : isCaptain
          ? `<details class="voice-add"><summary>Team voice on Discord (optional)</summary><p class="muted small">Create a voice channel (or use your own server), then <em>Invite people → Copy link</em> and paste it here. Only your 4 teammates will see it.</p><form data-form="voice" data-id="${m.id}" class="inline-form"><input class="input" name="link" placeholder="https://discord.gg/..." required><button class="btn btn-dark btn-small">Share with my team</button></form></details>`
          : '';
      body=`<div class="match-room">${code}${voice?`<div style="margin-top:10px">${voice}</div>`:''}</div>`;
      const deadline=`<p class="muted small">Report within ${countdown(m.result_deadline)}. If only one captain reports by then, that score counts. With no report, the match doesn't count.</p>`;
      if(isCaptain){
        body+=`<h3 style="margin:18px 0 6px">After the game: report the score</h3>`
          +(myReport?`<p>You reported <strong>${myReport[0]}–${myReport[1]}</strong>. ${theirReport?'':'Waiting for the other captain.'}</p><details class="muted small"><summary>Change your report</summary>${reportForm('Update')}</details>`:reportForm('Report result'))+deadline;
      } else {
        body+=`<p class="muted" style="margin-top:16px">After the game, your captain reports the score. Then you can rate everyone you played with.</p>`;
      }
    } else if(m.status==='DISPUTED'){
      head=`<div class="eyebrow" style="color:#ffb3b9">RESULT DISPUTED</div><h2 style="margin-top:8px">${esc(mine?.name)} vs ${esc(other?.name)}</h2>
        <p class="muted">The captains reported different scores${myReport&&theirReport?` (your side: ${myReport[0]}–${myReport[1]}, other side: ${theirReport[0]}–${theirReport[1]})`:''}. An admin will decide. Until then the match doesn't count.</p>`;
      if(isCaptain) body=`<p class="muted small">Made a mistake? Correct your report. If both reports match, the result is confirmed.</p>${reportForm('Correct report')}`;
    } else if(m.status==='COMPLETED'){
      const [me,them]=mySide([m.score_a,m.score_b]);
      head=`<div class="eyebrow">MATCH FINISHED</div>
        <h2 style="margin-top:8px">${esc(mine?.name)} <span class="score">${me} – ${them}</span> ${esc(other?.name)}</h2>
        <p class="muted">${me>them?'🏆 Your team won.':me<them?'Your team lost.':'Draw.'} Rate the players you played with, teammates and opponents. Ratings build their Trust Score.</p>`;
    } else if(m.status==='NO_RESULT'){
      head=`<div class="eyebrow">MATCH CLOSED</div><h2 style="margin-top:8px">${esc(mine?.name)} vs ${esc(other?.name)}</h2>
        <p class="muted">No result was reported in time, so this match doesn't count for anyone.</p>`;
    }
    const canRate=m.status==='COMPLETED';
    return `<div class="panel match-panel">${head}
      <div class="versus">
        <div>${teamHead(mine)}${roster(mine,canRate)}</div>
        <div class="vs">VS</div>
        <div>${teamHead(other)}${roster(other,canRate)}</div>
      </div>${body}</div><div style="height:16px"></div>`;
  }

  function teamPanel(d){
    const t=d.team, me=d.player.id;
    if(!t){
      return `<div class="panel">
        <h2>Create your five</h2>
        <form data-form="create-team" class="form-grid">
          <div class="full"><label>Team name</label><input class="input" name="name" maxlength="40" minlength="2" placeholder="e.g. Casablanca Kings" required></div>
          <div><label>Region</label><select name="region" data-regions="${esc(d.player.region)}"></select></div>
          <div><label>FACEIT level range</label><div style="display:flex;gap:8px">
            <input class="input" name="min_level" type="number" min="1" max="10" value="1">
            <input class="input" name="max_level" type="number" min="1" max="10" value="10"></div></div>
          <div class="full"><button class="btn btn-green">Create team</button>
            <span class="muted small" style="margin-left:10px">or <a href="/teams" style="color:var(--green)">browse teams</a> and request to join one.</span></div>
        </form>
      </div>`;
    }
    const captain=t.captain_id===me;
    const editable=['OPEN','READY'].includes(t.status);
    const members=t.members.map(p=>`
      <div class="row">
        <div>${playerLink(p)} ${p.id===t.captain_id?'<span class="status green">CAPTAIN</span>':''}
          <div class="muted small">FACEIT ${p.faceit_level??'—'} · ${esc(p.role||'—')} · Trust ${p.trust_score??'—'}</div></div>
        ${captain && p.id!==me && editable?`<div class="row-actions">
          ${btn('Make captain','transfer','btn-dark',{id:t.id,arg:p.id,confirm:`Make ${p.display_name} the captain?`})}
          ${btn('Remove','remove','btn-danger',{id:t.id,arg:p.id,confirm:`Remove ${p.display_name} from the team?`})}
        </div>`:''}
      </div>`).join('');
    const empty=Array.from({length:5-t.count},()=>`<div class="row"><span class="muted">Open slot</span></div>`).join('');

    let controls='';
    if(t.status==='OPEN' && t.expires_at){
      controls+=`<p class="muted small" style="margin-top:12px">⏳ ${t.count<5?'Disbands in':'Queue within'} ${countdown(t.expires_at)} ${t.count<5?'unless a new player joins':'or the team is disbanded'}.</p>`;
    }
    if(captain && t.status==='OPEN'){
      controls+= t.count<5
        ? `<form data-form="invite" data-id="${t.id}" class="inline-form"><input class="input" name="username" placeholder="Invite by STACK5 username" required><button class="btn btn-green btn-small">Invite</button></form>
           <p class="muted small" style="margin-top:8px">Or find players on <a href="/players" style="color:var(--green)">Find Players</a>. You need 5 players to queue.</p>`
        : `<div class="actions" style="margin-top:16px">${btn('Find match','queue','btn-green',{id:t.id})}</div>`;
    }
    if(t.status==='READY'){
      controls+=`<p style="margin-top:16px"><strong>Searching for an opponent…</strong> <span class="muted">Teams in your region are matched automatically.</span></p>`;
      if(t.queue_expires_at) controls+=`<p class="muted small">⏳ Leaves the queue in ${countdown(t.queue_expires_at)} if no match is found.</p>`;
      if(captain) controls+=`<div class="actions" style="margin-top:10px">${btn('Leave queue','unqueue','btn-dark',{id:t.id})}</div>`;
    }
    if(editable){
      controls+=`<div class="actions" style="margin-top:18px">${captain
        ? btn('Disband team','disband','btn-danger',{id:t.id,confirm:'Disband this team? All members will be released.'})
        : btn('Leave team','leave','btn-danger',{id:t.id,confirm:'Leave this team?'})}</div>`;
    }
    return `<div class="panel">
      <div class="card-top"><div><h2 style="margin:0">${esc(t.name)}</h2><div class="muted small">${esc(t.region)} · FACEIT ${t.min_level}–${t.max_level} · ${t.count}/5 players</div></div>${statusBadge(t.status)}</div>
      <div style="margin-top:14px">${members}${empty}</div>
      ${controls}
    </div>`;
  }

  function sidePanel(d){
    const invites=d.invites.length?d.invites.map(i=>`
      <div class="row"><div><strong>${esc(i.team_name)}</strong><div class="muted small">${esc(i.region)} · ${i.count}/5 · from ${esc(i.invited_by)}</div></div>
        <div class="row-actions">${btn('Accept','accept-invite','btn-green',{id:i.id})}${btn('Decline','decline-invite','btn-dark',{id:i.id})}</div></div>`).join('')
      :'<p class="muted small">No pending invitations.</p>';
    let html=`<div class="panel"><h2>Invitations</h2>${invites}</div>`;
    if(d.team && d.team.captain_id===d.player.id && d.team.status==='OPEN'){
      const reqs=d.joinRequests.length?d.joinRequests.map(r=>`
        <div class="row"><div>${playerLink(r)}<div class="muted small">FACEIT ${r.faceit_level??'—'} · ${esc(r.role||'—')} · Trust ${r.trust_score??'—'}</div></div>
          <div class="row-actions">${btn('Accept','accept-request','btn-green',{id:r.id})}${btn('Decline','decline-request','btn-dark',{id:r.id})}</div></div>`).join('')
        :'<p class="muted small">No one has asked to join yet.</p>';
      html+=`<div class="panel"><h2>Join requests</h2>${reqs}</div>`;
    }
    if(d.myRequests.length){
      html+=`<div class="panel"><h2>Your requests</h2>${d.myRequests.map(r=>`<div class="row"><span>${esc(r.team_name)}</span><span class="status amber">Pending</span></div>`).join('')}</div>`;
    }
    html+=`<div class="panel"><h2>Your profile</h2>
      <div class="muted small">${countryFlag(d.player.country)} ${esc(d.player.region)} · FACEIT ${d.player.faceit_level} · ${esc(d.player.role)}</div>
      <div class="muted small" style="margin-top:6px">${d.eligibility?.eligible?'<span class="status green">VERIFIED</span> Meets STACK5 requirements':'<span class="status amber">NOT VERIFIED</span>'}</div>
      <div class="actions" style="margin-top:12px"><a class="btn btn-small btn-dark" href="/player/${encodeURIComponent(d.player.display_name)}">View public profile</a><a class="btn btn-small btn-outline" href="/account">Account</a></div></div>`;
    return html;
  }

  async function renderSetup(box,d){
    // Only older accounts created before Steam sign-in can get here without a proven Steam account.
    if(!d.account.verified_steam_id){
      box.innerHTML=`<div class="panel" style="max-width:640px">
        <h2 style="margin-top:8px">Link your Steam account</h2>
        <p class="muted">Sign in on Steam's own website to prove the account is yours. Steam only tells us your SteamID. We never see your password, and nobody can link your account but you.</p>
        <div class="actions" style="margin-top:16px">${steamButton('Sign in through Steam')}</div>
      </div>`;
      return;
    }
    const cat=await catalog();
    const steamField=`<div class="full"><label>Steam account</label><div class="input" style="display:flex;justify-content:space-between;align-items:center"><span>✅ Verified · ${esc(d.account.verified_steam_id)}</span><a href="https://steamcommunity.com/profiles/${esc(d.account.verified_steam_id)}" target="_blank" rel="noopener" style="color:var(--green)">View</a></div></div>`;
    box.innerHTML=`<div class="panel" style="max-width:760px">
      <div class="eyebrow">LAST STEP</div>
      <h2 style="margin-top:8px">Set up your player profile</h2>
      <p class="muted" style="margin-top:0">This is what teams see when they look for players. STACK5 never asks for your Steam password.</p>
      <form data-form="profile" class="form-grid" style="margin-top:18px">
        ${steamField}
        <div><label>Display name</label><input class="input" name="display_name" maxlength="40" value="${esc(d.account.username)}" required></div>
        <div><label>Country</label><select name="country" required>${cat.countries.map(c=>`<option value="${c.code}" data-region="${c.region}" ${c.code==='MA'?'selected':''}>${c.flag} ${esc(c.name)}</option>`).join('')}</select></div>
        <div><label>Matchmaking region</label><select name="region" disabled>${cat.regions.map(r=>`<option value="${r.id}">${r.flag} ${esc(r.name)}</option>`).join('')}</select></div>
        <div><label>FACEIT level</label><select name="faceit_level">${Array.from({length:10},(_,i)=>`<option ${i===4?'selected':''}>${i+1}</option>`).join('')}</select></div>
        <div><label>FACEIT Elo (optional)</label><input class="input" name="faceit_elo" type="number" min="0" max="5000" placeholder="e.g. 1450"></div>
        <div><label>Main role</label><select name="role">${ROLES.map(r=>`<option>${r}</option>`).join('')}</select></div>
        <div><label>Language</label><select name="language">${LANGS.map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</select></div>
        <div class="full"><label>Avatar URL (optional, https)</label><input class="input" name="avatar_url" type="url" placeholder="https://..."></div>
        <div class="full"><button class="btn btn-green">Save profile</button></div>
      </form>
    </div>`;
    const form=box.querySelector('[data-form="profile"]');
    const syncRegion=()=>{ form.region.value=form.country.selectedOptions[0].dataset.region; };
    form.country.addEventListener('change',syncRegion);
    syncRegion();
  }

  const ACTIONS={
    'accept-invite':  id=>post(`/api/team-invites/${id}/accept`),
    'decline-invite': id=>post(`/api/team-invites/${id}/decline`),
    'accept-request': id=>post(`/api/join-requests/${id}/accept`),
    'decline-request':id=>post(`/api/join-requests/${id}/decline`),
    'queue':          id=>post(`/api/teams/${id}/queue`),
    'unqueue':        id=>post(`/api/teams/${id}/unqueue`),
    'leave':          id=>post(`/api/teams/${id}/leave`),
    'disband':        id=>post(`/api/teams/${id}/disband`),
    'remove':     (id,arg)=>post(`/api/teams/${id}/remove`,{player_id:Number(arg)}),
    'transfer':   (id,arg)=>post(`/api/teams/${id}/transfer`,{player_id:Number(arg)}),
    'accept-match':(id,arg)=>post(`/api/matches/${id}/accept`,{team_id:Number(arg)}),
    'decline-match':  id=>post(`/api/matches/${id}/decline`),
    'recheck': async ()=>{
      const e=await post('/api/me/eligibility/recheck');
      return {message:e.eligible?'All checks passed. You can play!':'Still missing some requirements.'};
    },
    'copy-code': async (_,code)=>{
      try{ await navigator.clipboard.writeText(code); }
      catch{ const t=document.createElement('textarea'); t.value=code; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      return {message:'Code copied. Paste it in CS2: Private Matchmaking → Manually Enter a Code.', keep:true};
    },
    'rate': async id=>{
      const rating=Number(document.querySelector(`.rate-select[data-player="${id}"]`).value);
      await post('/api/trust',{to_player_id:Number(id),rating});
      return {message:'Rating saved.', keep:true};
    }
  };

  async function onAction(e){
    const b=e.target.closest('[data-act]');
    if(!b || !ACTIONS[b.dataset.act]) return;
    if(b.dataset.confirm && !confirm(b.dataset.confirm)) return;
    b.disabled=true;
    try{
      const r=await ACTIONS[b.dataset.act](b.dataset.id,b.dataset.arg);
      if(r?.message) toast(r.message);
      if(r?.keep) b.disabled=false; else await renderPlay();
    }catch(err){ toast(err.message,true); b.disabled=false; }
  }

  async function onForm(e){
    const form=e.target.closest('form[data-form]');
    if(!form) return;
    e.preventDefault();
    const data=Object.fromEntries(new FormData(form));
    const button=form.querySelector('button');
    if(button) button.disabled=true;
    try{
      if(form.dataset.form==='code'){ await post(`/api/matches/${form.dataset.id}/code`,data); toast('Code posted. All 10 players can see it now.'); }
      if(form.dataset.form==='voice'){ const r=await post(`/api/matches/${form.dataset.id}/voice`,data); toast(r.message); }
      if(form.dataset.form==='report'){ const r=await post(`/api/matches/${form.dataset.id}/result`,{my_score:Number(data.my_score),their_score:Number(data.their_score)}); toast(r.message); }
      if(form.dataset.form==='create-team'){ await post('/api/teams',data); toast('Team created. Invite your players.'); }
      if(form.dataset.form==='invite'){ const r=await post(`/api/teams/${form.dataset.id}/invite`,data); toast(r.message||'Invitation sent.'); }
      if(form.dataset.form==='profile'){
        data.region=form.region.value;
        if(!data.avatar_url) delete data.avatar_url;
        await post('/api/profile',data); toast('Profile saved. Welcome to STACK5!');
      }
      await renderPlay();
    }catch(err){ toast(err.message,true); if(button) button.disabled=false; }
  }

  // Region selects are filled from the catalog after render.
  new MutationObserver(async()=>{
    const sels=document.querySelectorAll('select[data-regions]:not([data-filled])');
    if(!sels.length) return;
    const cat=await catalog();
    sels.forEach(s=>{
      s.dataset.filled='1';
      s.innerHTML=cat.regions.map(r=>`<option value="${r.id}" ${r.id===s.dataset.regions?'selected':''}>${r.flag} ${esc(r.name)}</option>`).join('');
    });
  }).observe(document.documentElement,{childList:true,subtree:true});

  // ---------- Account page (self-service deletion) ----------
  async function account(){
    layout('Account',`<div class="container" style="max-width:720px"><div class="eyebrow">ACCOUNT</div><h1>Your account</h1><div id="account"><div class="empty">Loading...</div></div></div>`);
    const box=document.getElementById('account');
    const r=await fetch('/api/me',{credentials:'include'});
    if(!r.ok){ box.innerHTML=`<div class="panel"><p class="muted" style="margin:0">Please <a href="/login" style="color:var(--green)">sign in</a> first.</p></div>`; return; }
    const me=await r.json();
    state.csrf=me.csrf_token;
    if(new URLSearchParams(location.search).get('email')==='verified') toast('Email verified.');
    const emailStatus=!me.account.email?'<span class="muted">Not set</span>':`${esc(me.account.email)} <span class="muted small">${me.account.email_verified?'✅ verified':'· check your inbox to verify'}</span>`;
    box.innerHTML=`
      <div class="panel">
        <h2>Details</h2>
        <div class="row"><span class="muted">Username</span><strong>${esc(me.account.username)}</strong></div>
        <div class="row"><span class="muted">Email (optional)</span><span>${emailStatus}</span></div>
        <form id="emailForm" class="inline-form" style="margin:6px 0 10px"><input class="input" name="email" type="email" placeholder="you@example.com" value="${esc(me.account.email||'')}"><button class="btn btn-dark btn-small">Save email</button></form>
        <div class="row"><span class="muted">Player profile</span>${me.player?`<a href="/player/${encodeURIComponent(me.player.display_name)}" style="color:var(--green)">${esc(me.player.display_name)}</a>`:'<span class="muted">Not set up</span>'}</div>
        <p class="muted small" style="margin-bottom:0">Want to change something or get a copy of your data? Email <a href="mailto:contact@stack5cs.com" style="color:var(--green)">contact@stack5cs.com</a>. See our <a href="/privacy" style="color:var(--green)">Privacy Policy</a> and <a href="/terms" style="color:var(--green)">Terms</a>.</p>
      </div>
      <div class="panel" style="border-color:#4a2a2e">
        <h2 style="color:#ffb3b9">Delete account</h2>
        <p class="muted" style="margin-top:0">This permanently deletes your account, email, ratings, Steam data and reliability history. Your public profile is replaced by an anonymous "Deleted player" in past teams and matches. If you captain a team, it is disbanded. This can't be undone.</p>
        <form id="deleteForm" class="form-grid">
          <div><label>Type DELETE to confirm</label><input class="input" name="confirm" autocomplete="off" required pattern="DELETE"></div>
          <div class="full"><button class="btn btn-danger">Delete my account permanently</button></div>
        </form>
      </div>`;
    const emailForm=document.getElementById('emailForm');
    emailForm.onsubmit=async e=>{
      e.preventDefault();
      const b=emailForm.querySelector('button'); b.disabled=true;
      try{ const r=await post('/api/account/email',{email:emailForm.email.value.trim()}); toast(r.message); await account(); }
      catch(err){ toast(err.message,true); b.disabled=false; }
    };
    const form=document.getElementById('deleteForm');
    form.onsubmit=async e=>{
      e.preventDefault();
      if(!confirm('Delete your STACK5 account permanently?')) return;
      const b=form.querySelector('button'); b.disabled=true;
      try{
        await post('/api/account/delete',Object.fromEntries(new FormData(form)));
        box.innerHTML=`<div class="panel"><h2>Your account has been deleted.</h2><p class="muted">Thanks for trying STACK5.</p><a class="btn btn-dark" href="/">Back to home</a></div>`;
        window.Stack5CurrentAccount=null;
      }catch(err){ toast(err.message,true); b.disabled=false; }
    };
  }

  // ---------- Marketplace buttons ----------
  async function requestJoin(teamId, b){
    if(!window.Stack5CurrentAccount){ location.href='/login'; return; }
    b.disabled=true;
    try{ const r=await post(`/api/teams/${teamId}/request-join`); toast(r.message); b.textContent='Requested'; }
    catch(err){ toast(err.message,true); b.disabled=false; }
  }

  async function invitePlayer(playerId, b){
    if(!window.Stack5CurrentAccount){ location.href='/login'; return; }
    b.disabled=true;
    try{
      const d=await get('/api/my/dashboard',{credentials:'include'});
      if(!d.team || d.team.captain_id!==d.player?.id) throw new Error('Create a team on the Play page first. Only captains can invite.');
      const r=await post(`/api/teams/${d.team.id}/invite`,{player_id:playerId});
      toast(r.message); b.textContent='Invited';
    }catch(err){ toast(err.message,true); b.disabled=false; }
  }

  function esc(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function route(){
    const p=location.pathname.replace(/\/$/,'')||'/';
    if(p==='/') return home();
    if(p==='/teams') return teams();
    if(p==='/players') return players();
    if(p.startsWith('/player/')) return playerProfile(decodeURIComponent(p.split('/')[2]));
    if(p==='/play') return play();
    if(p==='/account') return account();
    if(p==='/matches') return matchesPage();
    if(p==='/contact') return contactPage();
    if(p==='/guide') return guidePage();
    if(p==='/rankings') return layout('Rankings',`<div class="container"><div class="eyebrow">RANKINGS</div><h1>Rankings</h1><div class="empty">Rankings coming next.</div></div>`,'rankings');
    if(p.startsWith('/team/')) return teamProfile(p.split('/')[2]);
    return home();
  }

  async function teamProfile(id){
    const t=await get('/api/teams/'+id);
    layout(t.name,`
      <div class="container">
        <div class="eyebrow">STACK5 TEAM</div>
        <h1 style="font-size:40px">${esc(t.name)}</h1>
        <p class="subtitle">${esc(t.region)} · ${t.count}/5 players · FACEIT ${t.min_level}–${t.max_level}</p>
        <div class="section">
          <h2>Roster</h2>
          <div class="grid">${(t.members||[]).map(p=>`
            <a class="card" href="/player/${encodeURIComponent(p.display_name)}">
              <h3>${esc(p.display_name)}</h3>
              <div class="meta"><span>FACEIT ${p.faceit_level??'—'}</span><span>${esc(p.role||'—')}</span></div>
            </a>`).join('')}</div>
        </div>
      </div>`);
  }

  async function logout(){
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: state.csrf ? { 'X-CSRF-Token': state.csrf } : {}
      });
    } catch(error) {
      console.error('[STACK5 LOGOUT]', error);
    }

    window.Stack5CurrentAccount = null;
    location.href = '/';
  }

  return {
    route,
    logout,
    requestJoin,
    invitePlayer
  };
})();

Stack5.route();
