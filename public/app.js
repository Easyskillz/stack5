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
          <select id="region"><option value="">Region</option><option>EU</option><option>NA</option><option>SA</option><option>ASIA</option><option>OCE</option><option>AFRICA</option><option>MENA</option></select>
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
            <button class="btn btn-green btn-small" onclick="alert('Join request will be connected next.')">${tr('join')}</button>
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
          <select id="region"><option value="">Region</option><option>EU</option><option>NA</option><option>SA</option><option>ASIA</option><option>OCE</option><option>AFRICA</option><option>MENA</option></select>
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
            <button class="btn btn-green btn-small" onclick="alert('Invitation will be connected next.')">${tr('invite')}</button>
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
    layout('Build. Match. Play.',`
      <section class="hero">
        <div class="eyebrow">CS2 TEAM MATCHMAKING</div>
        <h1>Find your five.<br><span style="color:var(--green)">Find your match.</span></h1>
        <p class="subtitle">A trusted matchmaking layer for players who want better teammates, better opponents and a reputation that actually means something.</p>
        <div class="actions">
          <a class="btn btn-green" href="/play">${tr('play')}</a>
          <a class="btn btn-dark" href="/teams">${tr('teams')}</a>
          <a class="btn btn-dark" href="/players">${tr('players')}</a>
        </div>
      </section>
      <div class="container">
        <div class="grid">
          <div class="card"><div class="eyebrow">01</div><h2 style="margin-top:10px">Build</h2><p class="muted">Create your five, find missing players and build a team you trust.</p></div>
          <div class="card"><div class="eyebrow">02</div><h2 style="margin-top:10px">Match</h2><p class="muted">Discover compatible teams or let STACK5 find the best opponent.</p></div>
          <div class="card"><div class="eyebrow">03</div><h2 style="margin-top:10px">Play</h2><p class="muted">Skill matters. Reliability, communication and teamplay matter too.</p></div>
        </div>
      </div>`);
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
    if(p==='/play') return layout('Play',`<div class="container"><div class="eyebrow">PLAY</div><h1>Find your match.</h1><p class="subtitle">Quick Match and opponent discovery will live here.</p><div class="actions"><a class="btn btn-green" href="/teams">Browse teams</a></div></div>`,'play');
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
    logout
  };
})();

Stack5.route();
