const Stack5 = (() => {
  const state = { lang: localStorage.getItem('stack5_lang') || 'en' };

  const T = {
    en:{
      play:'Play', teams:'Find a Team', players:'Find Players', matches:'Matches',
      rankings:'Rankings', login:'Login', register:'Create account',
      profile:'My Profile', myTeam:'My Team', logout:'Logout',
      view:'View', join:'Request to Join', invite:'Invite', challenge:'Challenge',
      trust:'Trust', reliability:'Reliability', teamplay:'Teamplay',
      search:'Search...', noResults:'Nothing available right now.'
    },
    fr:{
      play:'Jouer', teams:'Trouver une équipe', players:'Trouver des joueurs', matches:'Matchs',
      rankings:'Classement', login:'Connexion', register:'Créer un compte',
      profile:'Mon profil', myTeam:'Mon équipe', logout:'Déconnexion',
      view:'Voir', join:'Demander à rejoindre', invite:'Inviter', challenge:'Défier',
      trust:'Confiance', reliability:'Fiabilité', teamplay:"Esprit d'équipe",
      search:'Rechercher...', noResults:'Aucun résultat disponible.'
    }
  };

  function tr(k){ return T[state.lang][k] || T.en[k] || k; }

  async function get(url, options={}){
    const r=await fetch(url,options);
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  function countryFlag(code){
    if(!code || code.length!==2) return '';
    return [...code.toUpperCase()].map(c=>String.fromCodePoint(127397+c.charCodeAt())).join('');
  }

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
        </nav>

        <div class="header-right" id="header-right">
          <button class="lang" onclick="Stack5.toggleLang()">${state.lang.toUpperCase()}</button>
          <a class="btn btn-dark btn-small" href="/login">${tr('login')}</a>
          <a class="btn btn-green btn-small" href="/register">${tr('register')}</a>
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
        <button class="lang" onclick="Stack5.toggleLang()">
          ${state.lang.toUpperCase()}
        </button>

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
    return `<footer><div style="max-width:1180px;margin:auto">STACK5 · Build. Match. Play.</div></footer>`;
  }

  function layout(title,content,active=''){
    document.title=`${title} · STACK5`;
    document.body.innerHTML=header(active)+`<main>${content}</main>`+footer();
    refreshHeaderAuth();
  }

  function toggleLang(){
    state.lang=state.lang==='en'?'fr':'en';
    localStorage.setItem('stack5_lang',state.lang);
    location.reload();
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
            <span>${tr('trust')} ${p.trust_score??'—'}</span>
            <span>${tr('reliability')} ${p.reliability_score??'—'}</span>
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
            </div>
          </div>
          <div class="stat-grid">
            <div class="stat"><div class="stat-label">${tr('trust')}</div><div class="stat-value">${p.trust_score??'—'}</div></div>
            <div class="stat"><div class="stat-label">${tr('reliability')}</div><div class="stat-value">${p.reliability_score??'—'}</div></div>
            <div class="stat"><div class="stat-label">${tr('teamplay')}</div><div class="stat-value">${p.teamplay_score??'—'}</div></div>
          </div>
          <div class="detail-grid">
            <div class="detail"><label>FACEIT Level</label><strong>${p.faceit_level??'—'}</strong></div>
            <div class="detail"><label>FACEIT ELO</label><strong>${p.faceit_elo??'—'}</strong></div>
            <div class="detail"><label>Role</label><strong>${esc(p.role||'—')}</strong></div>
            <div class="detail"><label>Language</label><strong>${esc(p.language||'—')}</strong></div>
          </div>
          ${p.steam_url?`<div class="actions"><a class="btn btn-dark" href="${esc(p.steam_url)}" target="_blank" rel="noopener">View Steam profile</a></div>`:''}
        </div>
      </div>`);
  }

  async function home(){
    const features=[
      ['🛡️','Trusted player identity','Create a STACK5 account, verify your email and build a player profile linked to your public Steam profile.'],
      ['⭐','Reputation, not just Elo','Keep skill separate from reliability, teamplay, communication and conduct signals.'],
      ['🎯','Team-based matchmaking','Build your five, enter the queue and find another complete team at a comparable level.'],
      ['🔎','Verification layers','Start with email and public Steam identity. Stronger verification can be added as STACK5 evolves.'],
      ['🌍','Regional matchmaking','A global regional structure designed to connect players and teams with competitive matches worldwide.'],
      ['🔐','Steam-safe by design','STACK5 never needs your Steam password, Steam Guard code, trade URL or inventory access.']
    ];
    const steps=[
      ['Create account','STACK5 username, email and password.'],
      ['Complete profile','Steam public URL, country, region, level, role and language.'],
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
          <a class="btn btn-green" href="/register" data-guest-cta>Create your account</a>
          <a class="btn btn-dark" href="#how">How STACK5 works</a>
          <a class="btn btn-dark" href="/teams">${tr('teams')}</a>
        </div>
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
            <div class="actions"><a class="btn btn-green" href="/register" data-guest-cta>Create your STACK5 account</a></div>
          </div>
        </div>
      </div>`);

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
    MATCH_CONFIRMED:['Match confirmed','green'], CANCELLED:['Disbanded','']
  };
  function statusBadge(s){ const [label,cls]=STATUS[s]||[s,'']; return `<span class="status ${cls}">${esc(label)}</span>`; }
  const ROLES=['Rifler','AWPer','Entry','IGL','Support','Lurker'];
  const LANGS=[['EN','English'],['FR','Français'],['AR','العربية'],['ES','Español'],['DE','Deutsch'],['PT','Português'],['IT','Italiano'],['NL','Nederlands'],['TR','Türkçe'],['RU','Русский']];
  const btn=(label,act,cls='btn-dark',data={})=>`<button class="btn btn-small ${cls}" data-act="${act}" ${Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}</button>`;
  const playerLink=p=>`<a href="/player/${encodeURIComponent(p.display_name)}"><strong>${esc(p.display_name)}</strong></a>`;

  // ---------- Play hub ----------
  let pollTimer=null;

  async function play(){
    layout('Play',`
      <div class="container">
        <div class="eyebrow">PLAY</div>
        <h1>Find your match.</h1>
        <div id="play"><div class="empty">Loading...</div></div>
      </div>`,'play');
    const box=document.getElementById('play');
    box.addEventListener('click',onAction);
    box.addEventListener('submit',onForm);
    await renderPlay();
  }

  async function renderPlay(){
    clearTimeout(pollTimer);
    const box=document.getElementById('play');
    if(!box) return;
    const r=await fetch('/api/my/dashboard',{credentials:'include'});
    if(r.status===401){
      box.innerHTML=`<div class="panel" style="max-width:560px">
        <h2>Log in to play</h2>
        <p class="muted">Create a STACK5 account, set up your player profile and build your five.</p>
        <div class="actions" style="margin-top:16px"><a class="btn btn-green" href="/login">Log in</a><a class="btn btn-dark" href="/register">Create account</a></div>
      </div>`;
      return;
    }
    const d=await r.json();
    if(!d.player) return renderSetup(box,d);

    box.innerHTML=matchPanel(d)+`
      <div class="panel-grid">
        <div>${teamPanel(d)}</div>
        <div>${sidePanel(d)}</div>
      </div>`;

    // Keep the page live while waiting on the queue or the other captain (no text inputs are shown then).
    const waiting=(d.team && d.team.status==='READY') || (d.match && d.match.status==='PENDING');
    if(waiting) pollTimer=setTimeout(renderPlay,8000);
  }

  function matchPanel(d){
    const m=d.match;
    if(!m) return '';
    const mine=m.my_team_id===m.team_a_id?m.team_a:m.team_b;
    const other=m.my_team_id===m.team_a_id?m.team_b:m.team_a;
    const myAccepted=m.my_team_id===m.team_a_id?m.accepted_a:m.accepted_b;
    const isCaptain=mine && mine.captain_id===d.player.id;
    const roster=(t,rate)=>(t?.members||[]).map(p=>`
      <div class="row">
        <div>${playerLink(p)}<div class="muted small">FACEIT ${p.faceit_level??'—'} · ${esc(p.role||'—')}${t.captain_id===p.id?' · Captain':''}</div></div>
        <div class="row-actions">
          ${p.steam_url?`<a class="btn btn-small btn-outline" href="${esc(p.steam_url)}" target="_blank" rel="noopener">Steam</a>`:''}
          ${rate && p.id!==d.player.id?`<select class="rate-select" data-player="${p.id}" style="width:auto;padding:6px"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select>
          ${btn('Rate','rate','btn-dark',{id:p.id})}`:''}
        </div>
      </div>`).join('');

    let head, actions='';
    if(m.status==='PENDING'){
      head=`<div class="eyebrow">MATCH FOUND · ${m.compatibility}% COMPATIBLE</div><h2 style="margin-top:8px">${esc(mine?.name)} vs ${esc(other?.name)}</h2>`;
      if(isCaptain && !myAccepted) actions=`<div class="actions" style="margin-top:16px">${btn('Accept match','accept-match','btn-green',{id:m.id,arg:m.my_team_id})}${btn('Decline','decline-match','btn-danger',{id:m.id,confirm:'Decline this match? Your team will leave the queue.'})}</div>`;
      else if(myAccepted) actions=`<p class="muted" style="margin-top:14px">Your team accepted. Waiting for the other captain…</p>`;
      else actions=`<p class="muted" style="margin-top:14px">Waiting for your captain to accept…</p>`;
    } else {
      head=`<div class="eyebrow">MATCH CONFIRMED</div><h2 style="margin-top:8px">${esc(mine?.name)} vs ${esc(other?.name)}</h2>
        <p class="muted">Both teams are in. Captains: add each other on Steam (links below) and set up the server. After the game, rate the players you played with.</p>`;
    }
    const confirmed=m.status==='CONFIRMED';
    return `<div class="panel match-panel">${head}
      <div class="versus">
        <div><h3>${esc(mine?.name)}</h3>${roster(mine,confirmed)}</div>
        <div class="vs">VS</div>
        <div><h3>${esc(other?.name)}</h3>${roster(other,confirmed)}</div>
      </div>${actions}</div><div style="height:16px"></div>`;
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
    if(captain && t.status==='OPEN'){
      controls+= t.count<5
        ? `<form data-form="invite" data-id="${t.id}" class="inline-form"><input class="input" name="username" placeholder="Invite by STACK5 username" required><button class="btn btn-green btn-small">Invite</button></form>
           <p class="muted small" style="margin-top:8px">Or find players on <a href="/players" style="color:var(--green)">Find Players</a>. You need 5 players to queue.</p>`
        : `<div class="actions" style="margin-top:16px">${btn('Find match','queue','btn-green',{id:t.id})}</div>`;
    }
    if(t.status==='READY'){
      controls+=`<p style="margin-top:16px"><strong>Searching for an opponent…</strong> <span class="muted">Teams in your region are matched automatically.</span></p>`;
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
      <div class="actions" style="margin-top:12px"><a class="btn btn-small btn-dark" href="/player/${encodeURIComponent(d.player.display_name)}">View public profile</a></div></div>`;
    return html;
  }

  async function renderSetup(box,d){
    if(!d.account.email_verified){
      box.innerHTML=`<div class="panel" style="max-width:600px">
        <h2>Verify your email</h2>
        <p class="muted">We sent a verification link when you signed up. Click it, then come back here. Check your spam folder if you can't find it.</p>
        <form data-form="resend" class="inline-form"><input class="input" name="email" type="email" placeholder="Your account email" required><button class="btn btn-dark btn-small">Resend link</button></form>
      </div>`;
      return;
    }
    const cat=await catalog();
    box.innerHTML=`<div class="panel" style="max-width:760px">
      <h2>Set up your player profile</h2>
      <p class="muted" style="margin-top:0">This is what teams see when they look for players. STACK5 never asks for your Steam password.</p>
      <form data-form="profile" class="form-grid" style="margin-top:18px">
        <div class="full"><label>Steam profile URL</label><input class="input" name="steam_url" placeholder="https://steamcommunity.com/id/yourname" required></div>
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
      if(form.dataset.form==='create-team'){ await post('/api/teams',data); toast('Team created. Invite your players.'); }
      if(form.dataset.form==='invite'){ const r=await post(`/api/teams/${form.dataset.id}/invite`,data); toast(r.message||'Invitation sent.'); }
      if(form.dataset.form==='profile'){
        data.region=form.region.value;
        if(!data.avatar_url) delete data.avatar_url;
        await post('/api/profile',data); toast('Profile saved. Welcome to STACK5!');
      }
      if(form.dataset.form==='resend'){
        const r=await get('/api/auth/resend-verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        toast(r.message); if(button) button.disabled=false; return;
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
    if(p==='/matches') return layout('Matches',`<div class="container"><div class="eyebrow">MATCHES</div><h1>My matches</h1><div class="empty">Your matches will appear here.</div></div>`,'matches');
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
    toggleLang,
    logout,
    requestJoin,
    invitePlayer
  };
})();

Stack5.route();
