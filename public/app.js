const Stack5 = (() => {
  const state = {};

  // ---------- Language: /fr/... is the French site ----------
  // The pages are written in English; on /fr the dictionary in /i18n/fr.js (window.CL_FR) replaces each text
  // fragment, placeholder and tooltip as soon as it appears (MutationObserver, before the browser paints).
  const LANG=/^\/fr(\/|$)/.test(location.pathname)?'fr':'en';
  const PREFIX=LANG==='fr'?'/fr':'';
  const appPath=()=>location.pathname.replace(/^\/fr(?=\/|$)/,'')||'/';
  const localPath=p=>PREFIX+(p==='/'&&PREFIX?'':p);           // '/teams' -> '/fr/teams', '/' -> '/fr'
  const go=p=>{ location.href=localPath(p); };
  const DICT={}, PATTERNS=[];
  const normText=t=>t.replace(/\s+/g,' ').trim();
  if(LANG==='fr'){
    for(const [en,fr] of Object.entries(window.CL_FR||{})){
      const k=normText(en);
      if(k.includes('{x}')) PATTERNS.push([new RegExp('^'+k.split('{x}').map(x=>x.replace(/[.*+?^$()|[\]\\]/g,'\\$&')).join('(.+?)')+'$'),fr]);
      else DICT[k]=fr;
    }
    PATTERNS.sort((a,b)=>b[0].source.length-a[0].source.length);   // most specific first
  }
  function t(text){
    if(LANG!=='fr' || text==null) return text;
    const core=normText(String(text));
    if(!core) return text;
    let out=DICT[core];
    if(out==null) for(const [re,fr] of PATTERNS){ const m=re.exec(core); if(m){ let i=1; out=fr.replace(/\{x\}/g,()=>m[i++]??''); break; } }
    if(out==null) return text;
    const str=String(text);
    return (/^[.,)]/.test(out)?'':str.match(/^\s*/)[0])+out+str.match(/\s*$/)[0];   // "cheaters" + "." stay together
  }
  // Internal links stay on the French site (static files, API and Steam sign-in don't).
  const LOCAL_LINK=/^\/(?!fr(\/|$)|api\/|auth\/|assets\/|flags\/|img\/|media\/|i18n\/|favicon|apple-touch|og\.png|robots|sitemap|llms)/;
  function translateTree(root){
    if(LANG!=='fr' || !root) return;
    if(root.nodeType===3){ if(root.parentElement?.closest('.logo,[data-no-i18n]')) return; const v=t(root.nodeValue); if(v!==root.nodeValue) root.nodeValue=v; return; }
    if(root.nodeType!==1) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>/^(SCRIPT|STYLE|CODE)$/.test(n.parentNode?.nodeName)||n.parentElement?.closest('.logo,[data-no-i18n]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    for(let n=walker.nextNode(); n; n=walker.nextNode()){ const v=t(n.nodeValue); if(v!==n.nodeValue) n.nodeValue=v; }
    const els=root.querySelectorAll?[root,...root.querySelectorAll('[placeholder],[title],[aria-label],[alt],a[href]')]:[];
    for(const el of els){
      for(const a of ['placeholder','title','aria-label','alt']) if(el.hasAttribute?.(a)){ const v=t(el.getAttribute(a)); if(v!==el.getAttribute(a)) el.setAttribute(a,v); }
      if(el.tagName==='A' && !el.hasAttribute('data-lang')){ const h=el.getAttribute('href'); if(h && LOCAL_LINK.test(h)) el.setAttribute('href','/fr'+(h==='/'?'':h)); }
    }
  }
  // Remember the language being viewed, so Steam sign-in brings the player back to it.
  try{ document.cookie=`cl_lang=${LANG}; path=/; max-age=31536000; samesite=lax`; }catch{}
  if(LANG==='fr'){
    document.documentElement.lang='fr';
    new MutationObserver(list=>{ for(const m of list){
      if(m.type==='characterData') translateTree(m.target);
      else m.addedNodes.forEach(translateTree);
    } }).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  }
  // 🇫🇷 / 🇺🇸 switch: same page in the other language; the choice is remembered (cookie cl_lang) for Steam sign-in.
  function langSwitch(){
    const p=appPath()+location.search+location.hash;
    const opt=(code,flag,label,href)=>`<a class="lang-opt${LANG===code?' on':''}" data-lang href="${href}" onclick="document.cookie='cl_lang=${code}; path=/; max-age=31536000; samesite=lax'" title="${label}" aria-label="${label}"><img src="/flags/${flag}.svg" alt=""><span>${code.toUpperCase()}</span></a>`;
    return `<div class="lang-switch">${opt('en','us','English',p)}${opt('fr','fr','Français','/fr'+(p.startsWith('/?')||p==='/'?p.slice(1):p))}</div>`;
  }

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
  const FLAG_CODES=new Set('ma dz tn ly eg fr es de gb it be nl pt us ca br ar cl au nz jp kr sg my th sa ae il za ng tr ru ch lu ie mc ad mt'.split(' '));
  function countryFlag(code){
    const c=String(code||'').toLowerCase();
    return FLAG_CODES.has(c)?`<img class="flag" src="/flags/${c}.svg" alt="${esc(c.toUpperCase())}" title="${esc(c.toUpperCase())}">`:'';
  }
  // Languages are text chips (EN, FR…), never flags: a flag always means the player's country.
  function languageFlag(code){
    const c=String(code||'').toUpperCase();
    if(!c) return '';
    const name=(LANGS.find(l=>l[0]===c)||[c,c])[1];
    return `<span class="lang-chip" title="Speaks ${esc(name)}">${esc(c)}</span>`;
  }
  // CS2 Premier rating badge in the game's tier colours (self-reported by the player).
  const PREMIER_TIERS=[[30000,'gold','Gold'],[25000,'red','Red'],[20000,'pink','Pink'],[15000,'purple','Purple'],[10000,'blue','Blue'],[5000,'cyan','Light blue'],[1,'grey','Grey']];
  const premierTier=r=>PREMIER_TIERS.find(([min])=>r>=min);
  function premier(r){
    r=Number(r)||0;
    if(!r) return '<span class="premier unrated" title="No CS2 Premier rating yet">Unrated</span>';
    const [,cls,name]=premierTier(r), txt=r.toLocaleString('en-US'), i=txt.lastIndexOf(',');
    return `<span class="premier t-${cls}" title="CS2 Premier rating · ${name} tier (self-reported)">${i<0?`<b>${txt}</b>`:`<b>${txt.slice(0,i)}</b><small>${txt.slice(i)}</small>`}</span>`;
  }
  const LEETIFY_ATTR='<a class="leetify-attr" href="https://leetify.com/" target="_blank" rel="noopener">Data Provided by Leetify</a>';
  const premierSource=p=>['leetify','test'].includes(p?.premier_source)?LEETIFY_ATTR:p?.premier_rating!=null?'<span class="muted small">self-reported</span>':'';
  function premierRange(min,max){
    min=Number(min)||0; max=Number(max??40000);
    if(!min && max>=40000) return '<span class="muted">Any Premier rating</span>';
    return `${premier(min)}<span class="muted">–</span>${max>=40000?'<span class="muted">any</span>':premier(max)}`;
  }
  // A player can speak several languages ("FR,AR,EN"); older rows only have `language`.
  const langsOf=p=>String(p?.languages||p?.language||'').split(',').map(x=>x.trim()).filter(Boolean);
  const languageFlags=codes=>(Array.isArray(codes)?codes:String(codes||'').split(',')).filter(Boolean).map(languageFlag).join('');
  const flags=(country,languages)=>{ const l=languageFlags(languages); return `<span class="flags">${countryFlag(country)}${l?`<span class="lang-chips" title="Languages spoken">🗣️${l}</span>`:''}</span>`; };
  // Game modes: 5v5 (Competitive/Premier) and 2v2 (Wingman). Older rows have no mode = 5v5.
  const teamSizeOf=t=>t?.mode==='2v2'?2:5;
  const modeBadge=t=>t?.mode==='2v2'?'<span class="mode-badge wingman">Wingman 2v2</span>':'<span class="mode-badge">5v5</span>';
  // Languages every member of a team speaks (teammates need one; opponents don't).
  const sharedLangs=members=>{ const sets=(members||[]).map(langsOf).filter(l=>l.length); return sets.length?sets.reduce((a,b)=>a.filter(x=>b.includes(x))):[]; };
  const langNames=codes=>codes.map(c=>(LANGS.find(l=>l[0]===c)||[c,c])[1]).join(', ');
  const languageBoxes=(selected=[])=>`<div class="lang-pick">${LANGS.map(([c,n])=>`<label><input type="checkbox" name="languages" value="${c}" ${selected.includes(c)?'checked':''}> ${languageFlag(c)} ${n}</label>`).join('')}</div>`;
  // A team's country/language = the most common one among its players.
  const mostCommon=(list,k)=>{ const c={}; for(const p of list||[]) if(p[k]) c[p[k]]=(c[p[k]]||0)+1; return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||null; };

  function header(active=''){
    return `
      <header class="header">
        <a class="logo" href="/">Clean<span>Lobby</span></a>

        <nav class="nav">
          <a class="${active==='play'?'active':''}" href="/play">${tr('play')}</a>
          <a class="${active==='teams'?'active':''}" href="/teams">${LANG==='fr'?'Équipes':tr('teams')}</a>
          <a class="${active==='players'?'active':''}" href="/players">${LANG==='fr'?'Joueurs':tr('players')}</a>
          <a class="${active==='matches'?'active':''}" href="/matches">${tr('matches')}</a>
          <a class="${active==='rankings'?'active':''}" href="/rankings">${tr('rankings')}</a>
          <a class="${active==='guide'?'active':''}" href="/guide">How it works</a>
        </nav>

        ${langSwitch()}
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
    return `<footer><div style="max-width:1180px;margin:auto">CleanLobby · Build. Match. Play. · <a href="/guide">How it works</a> · <a href="/contact">Contact</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></div></footer>`;
  }

  function layout(title,content,active=''){
    document.title=`${t(title)} · CleanLobby`;
    document.body.innerHTML=header(active)+`<main>${content}</main>`+footer();
    refreshHeaderAuth();
  }

  async function teams(){
    layout(tr('teams'),`
      <div class="container">
        <div class="eyebrow">CleanLobby MARKETPLACE</div>
        <h1>${tr('teams')}</h1>
        <p class="subtitle">Browse teams looking for players and choose the one that fits you.</p>
        <div class="filters">
          <input id="q" placeholder="${tr('search')}">
          <select id="mode"><option value="">All modes</option><option value="5v5">5v5</option><option value="2v2">Wingman 2v2</option></select>
          <select id="country">${countryOptions('Country')}</select>
          <select id="role"><option value="">Role</option><option>AWPer</option><option>Rifler</option><option>Entry</option><option>IGL</option><option>Support</option></select>
        </div>
        <div id="results" class="grid"><div class="empty">Loading...</div></div>
      </div>`,`teams`);

    async function load(){
      const data=await get('/api/discover/teams');
      const q=(document.getElementById('q').value||'').toLowerCase();
      const country=document.getElementById('country').value;
      const mode=document.getElementById('mode').value;
      let rows=data.filter(t=>
        (!q || t.name.toLowerCase().includes(q)) &&
        (!mode || (t.mode||'5v5')===mode) &&
        (!country || t.country===country)
      );
      document.getElementById('results').innerHTML=rows.length?rows.map(t=>`
        <article class="card">
          <div class="card-top">
            <div>
              <h3>${nm(t.name)}</h3>
              <div class="muted small">${modeBadge(t)} ${countryFlag(t.country)} ${esc(countryName(t.country))} · ${t.count}/${teamSizeOf(t)} players</div>
            </div>
            <span class="badge">OPEN</span>
          </div>
          <div class="meta">
            <span>${premierRange(t.min_rating,t.max_rating)}</span>
            <span>${t.languages?.length?`Speaks ${languageFlags(t.languages)}`:'<span class="muted">No shared language yet</span>'}</span>
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
        <div class="eyebrow">CleanLobby MARKETPLACE</div>
        <h1>${tr('players')}</h1>
        <p class="subtitle">Browse available players and discover teammates by language, role, Premier rating and reputation.</p>
        <div class="filters">
          <input id="q" placeholder="${tr('search')}">
          <select id="country">${countryOptions('Country')}</select>
          <select id="role"><option value="">Role</option><option>AWPer</option><option>Rifler</option><option>Entry</option><option>IGL</option><option>Support</option></select>
          <select id="lang"><option value="">Language</option>${LANGS.map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</select>
          <select id="tier"><option value="">Premier tier</option>${PREMIER_TIERS.map(([min,cls,name])=>`<option value="${cls}">${name} (${min===1?'under 5,000':min.toLocaleString('en-US')+'+'})</option>`).join('')}<option value="unrated">Unrated</option></select>
        </div>
        <div id="results" class="grid"><div class="empty">Loading...</div></div>
      </div>`,`players`);

    async function load(){
      const data=await get('/api/players');
      const q=(document.getElementById('q').value||'').toLowerCase();
      const country=document.getElementById('country').value;
      const role=document.getElementById('role').value;
      const tier=document.getElementById('tier').value;
      const lang=document.getElementById('lang').value;
      let rows=data.filter(p=>
        (!lang || langsOf(p).includes(lang)) &&
        (!tier || (tier==='unrated'?!p.premier_rating:premierTier(p.premier_rating||0)?.[1]===tier)) &&
        (!q || String(p.display_name||'').toLowerCase().includes(q)) &&
        (!country || p.country===country) &&
        (!role || p.role===role) &&
        (p.availability===undefined || p.availability!=='Unavailable')
      );
      document.getElementById('results').innerHTML=rows.length?rows.map(p=>`
        <article class="card">
          <div class="profile-head">
            <img class="avatar" src="${esc(p.avatar_url||'')}" onerror="this.style.display='none'">
            <div>
              <h3>${nm(p.display_name||'Player')}</h3>
              <div class="muted small">${countryFlag(p.country)} ${esc(countryName(p.country))}${langsOf(p).length?` · <span class="lang-chips" title="Languages spoken">🗣️${languageFlags(langsOf(p))}</span>`:''}</div>
            </div>
          </div>
          <div class="meta">
            <span>${premier(p.premier_rating)}</span>
            <span>${esc(p.role||'—')}</span>
          </div>
          <div class="meta">
            <span>${tr('trust')} <strong>${p.trust_score??'—'}</strong>${p.trust_confidence==='NEW'?' <span class="muted">(new)</span>':''}</span>
            <span>${tr('reliability')} <strong>${p.reliability_score??'—'}</strong></span>
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
              <div class="eyebrow">CleanLobby PLAYER</div>
              <h1 class="name-title" style="font-size:38px;margin:5px 0">${nm(p.display_name)}</h1>
              <div class="muted">${countryFlag(p.country)} ${esc(countryName(p.country))} · ${esc(p.role||'')}</div>
              <div class="meta">${p.steam_verified?'<span class="status green">STEAM VERIFIED</span>':'<span class="status">Steam not verified</span>'}${p.eligible?'<span class="status green">MEETS REQUIREMENTS</span>':''}</div>
            </div>
          </div>
          <div id="trust-box"><div class="empty">Loading trust score…</div></div>
          <div class="detail-grid">
            <div class="detail"><label>CS2 Premier rating ${premierSource(p)}</label><strong>${premier(p.premier_rating)}</strong></div>
            <div class="detail"><label>Role</label><strong>${esc(p.role||'—')}</strong></div>
            <div class="detail"><label>Speaks</label><strong>${langsOf(p).length?`${languageFlags(langsOf(p))} ${esc(langNames(langsOf(p)))}`:'—'}</strong></div>
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
  const PART_LABELS={identity:['Identity','Steam account history'],peer:['Peer reputation','👍/👎 votes from players they actually played with'],reliability:['Reliability','Accepting matches, not abandoning teams'],record:['Track record','Confirmed matches on CleanLobby']};

  // Votes after a match (👍/👎). Teammates: comms, teamplay, attitude. Opponents: attitude, sportsmanship.
  const ASPECT_INFO={comms:['🎙️','Comms'],teamplay:['🤝','Teamplay'],attitude:['😇','Attitude'],sportsmanship:['🏳️','Sportsmanship']};
  const TEAMMATE_ASPECTS=['comms','teamplay','attitude'], OPPONENT_ASPECTS=['attitude','sportsmanship'];
  function aspectSummary(aspects){
    const rows=Object.entries(aspects||{}).filter(([,v])=>v.up+v.down>0);
    if(!rows.length) return '';
    return `<div class="aspect-row">${rows.map(([k,v])=>{ const [i,n]=ASPECT_INFO[k]||['',k], pct=Math.round(100*v.up/(v.up+v.down));
      return `<span class="aspect-chip" title="${v.up} 👍 · ${v.down} 👎"><span>${i} ${n}</span><b style="color:${pct>=70?'var(--ok)':pct>=50?'#f2c94c':'var(--danger)'}">${pct}% 👍</b><small>${v.up+v.down}</small></span>`; }).join('')}</div>`;
  }
  // What a score means. 60+ is good; new players with a solid Steam account usually start around 65.
  const TRUST_BANDS=[[75,'Excellent','var(--ok)'],[60,'Good','var(--ok)'],[40,'Fair','#f2c94c'],[0,'Low','var(--danger)']];
  const trustBand=n=>TRUST_BANDS.find(([min])=>n>=min);
  // The most useful next steps for this score, from its weakest parts.
  function trustTips(t){
    const p=t.parts, tips=[];
    if((p.peer.ratings||0)<5) tips.push('<strong>Finish matches and collect votes.</strong> 👍/👎 votes from the players you played with are 30% of the score. After each match, vote on everyone: they vote on you too.');
    else if(p.peer.score<60) tips.push(`<strong>Votes are below average.</strong> ${(()=>{ const w=Object.entries(p.peer.aspects||{}).filter(([,v])=>v.up+v.down>=3).sort((a,b)=>a[1].up/(a[1].up+a[1].down)-b[1].up/(b[1].up+b[1].down))[0]; return w?`Your weakest point is ${ASPECT_INFO[w[0]][1].toLowerCase()}. `:''; })()}Each new match brings new votes, and older ones fade after a few months.`);
    if(p.reliability.incidents>0) tips.push('<strong>Stay reliable.</strong> Accept matches within 5 minutes, don’t decline, and don’t leave a team that’s in the queue. Incidents fade after about 3 months.');
    if((p.record.matches||0)<30) tips.push(`<strong>Play more matches to the end.</strong> Each match with an agreed score adds to your track record (${p.record.matches||0} so far, full at 30).`);
    if((p.identity.notes||[]).some(n=>/private|hidden|not verified/i.test(n))) tips.push('<strong>Make your Steam profile and game details public</strong> so your account age and CS2 hours count fully.');
    return tips.slice(0,3);
  }
  function trustPanel(t){
    const [confLabel,confText]=CONFIDENCE[t.confidence]||CONFIDENCE.NEW;
    const [,bandName,color]=trustBand(t.total);
    const part=(key)=>{
      const v=t.parts[key], [label,desc]=PART_LABELS[key];
      const detail=key==='identity'?(v.notes||[]).join(' · '):key==='peer'?(v.votes?`${v.votes} vote${v.votes>1?'s':''} · ${v.positive}% 👍`:v.ratings?`${v.ratings} rating${v.ratings>1?'s':''}`:'No votes yet'):key==='reliability'?(v.incidents?`${v.incidents} recent incident(s)`:'No incidents'):`${v.matches} match${v.matches===1?'':'es'}`;
      return `<div class="trust-part">
        <div class="trust-part-head"><span><strong>${label}</strong> <span class="muted small">${Math.round(v.weight*100)}%</span></span><strong>${v.score}</strong></div>
        <div class="bar"><span style="width:${Math.max(2,v.score)}%"></span></div>
        <div class="muted small" title="${esc(desc)}">${esc(detail||desc)}</div>
      </div>`;
    };
    return `<div class="trust-panel">
      <div class="trust-head">
        <div><div class="stat-label">CleanLobby Trust Score</div><div class="trust-total" style="color:${color}">${t.total} <span class="trust-band" style="color:${color}">${bandName}</span></div><div class="muted small">60 and above is good · 75+ excellent</div></div>
        <div style="text-align:right"><span class="status ${t.confidence==='ESTABLISHED'?'green':t.confidence==='BUILDING'?'amber':''}">${confLabel}</span><div class="muted small" style="margin-top:6px;max-width:260px">${confText}</div></div>
      </div>
      ${t.flags?.length?`<div class="trust-flags">${t.flags.map(f=>`<div>⚠️ ${esc(f)}</div>`).join('')}</div>`:''}
      <div class="trust-parts">${['identity','peer','reliability','record'].map(part).join('')}</div>
      ${aspectSummary(t.parts.peer.aspects)}
      ${trustTips(t).length?`<div class="trust-tips"><strong class="small">How to raise it</strong><ul>${trustTips(t).map(x=>`<li>${x}</li>`).join('')}</ul></div>`:''}
      <p class="muted small" style="margin:14px 0 0">CleanLobby is a reputation layer, not an anti-cheat. <a href="/guide#trust-score" style="color:var(--accent)">How the Trust Score works</a></p>
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
      ['🛡️','Steam-verified players','Everyone signs in through Steam and must pass the bar: account at least 2 years old, 500+ hours of CS2, no recent VAC or game ban.'],
      ['🎯','Full teams only','Complete 5-stacks against complete 5-stacks, or Wingman duos against duos, close enough for good ping, with a similar Premier rating. Played on Valve servers through CS2 Private Matchmaking.'],
      ['📈','Premier rating from Leetify','Ratings are read from Leetify, so nobody can fake their level.'],
      ['⭐','Public Trust Score','After each match, players vote 👍/👎 on comms, teamplay, attitude and sportsmanship. Votes, reliability and match record build a Trust Score (0–100).'],
      ['⚖️','Real admins','Both captains report the score. Disputes go to a real admin, not a bot.'],
      ['🔐','Steam-safe by design','We never see your password, your inventory or your trades.']
    ];
    const steps=[
      ['Sign in with Steam','On Steam’s own website, then pick a username.'],
      ['Complete profile','Country, role and the languages you speak. Premier comes from Leetify.'],
      ['Build your five','Invite friends or find missing players.'],
      ['Find your match','Queue as a full team and meet a comparable five.'],
      ['Play & report','Private Matchmaking code, then both captains report the score.']
    ];
    layout('Tired of cheaters? Find a trusted five.',`
      <section class="hero">
        <div class="eyebrow">CS2 5v5 &amp; Wingman matchmaking · Beta</div>
        <h1>Tired of cheaters?<br><span>Find a trusted five.</span></h1>
        <p class="subtitle">CleanLobby puts full teams of Steam-verified players against each other: 5v5 with your five, or Wingman 2v2 with your duo. Matched by CS2 Premier rating, and every player carries a public Trust Score.</p>
        <div class="actions">
          <a class="btn btn-green" href="/login" data-guest-cta>Sign in with Steam</a>
          <a class="btn btn-dark" href="/guide">How it works</a>
          <a class="btn btn-dark" href="/teams">${tr('teams')}</a>
        </div>
        ${liveStatsBox()}
      </section>

      <div class="container" style="padding-top:10px">
        <div class="wingman-new" id="wingman">
          <div><span class="mode-badge wingman">New</span> <strong>Wingman 2v2 is open.</strong> <span class="muted">Same process, two players: create a Wingman team, invite your duo, and get matched against another verified duo.</span></div>
          <a class="btn btn-green btn-small" href="/play">Play Wingman</a>
        </div>
        <div class="section">
          <h2>The CleanLobby difference</h2>
          <div class="section-lead">Everything is built around one idea: you should know who you’re playing with and against.</div>
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

        <div class="section" id="beta-countries">
          <h2>Open in <em>12 countries</em>, more soon</h2>
          <p class="section-lead">The beta starts small on purpose: Morocco and the English, French, Spanish and Portuguese-speaking countries of Europe, close enough for good ping and a shared language on comms. We’ll open more countries step by step. Not on the list? <a href="/contact" style="color:var(--accent)">Tell us where you play</a>.</p>
          <div class="beta-grid">${BETA.map(([c])=>`<div class="beta-country">${countryFlag(c)}<span>${countryName(c)}</span></div>`).join('')}</div>
        </div>

        <div class="section" id="tournaments">
          <div class="tourney">
            <div class="premium-badge">COMING UP</div>
            <h2 style="margin-top:14px">5v5 <em>tournaments</em></h2>
            <p class="section-lead" style="margin-top:14px">Cups for complete teams from the beta countries: brackets, scheduled matches, results on CleanLobby. Build your five now: teams with a track record and a good Trust Score will be first in line when sign-ups open.</p>
            <div class="actions"><a class="btn btn-green" href="/login" data-guest-cta>Build your five</a><a class="btn btn-dark" href="/contact">Get notified</a></div>
          </div>
        </div>

        <div class="section" id="premium">
          <div class="premium">
            <div>
              <div class="eyebrow">Premium · coming soon</div>
              <h2>Officiated matches on <em>private servers</em></h2>
              <p class="section-lead" style="margin-top:14px">For teams that want certainty. Your match runs on a private CS2 server, with a real admin watching it live:</p>
              <ul class="premium-list">
                <li>🛡️ <strong>Only the 10 players on the roster can connect.</strong> No swaps, no ringers.</li>
                <li>👁️ <strong>A real admin watches the match</strong> and reviews the demo when something looks off.</li>
                <li>📺 <strong>The admin can ask any player to stream their screen</strong> during the match, at any time, to make sure nothing fishy is going on.</li>
                <li>🚫 <strong>The admin can kick anyone.</strong> If a player is caught cheating, they’re out, and the admin finds a replacement on the spot so the match can go on.</li>
                <li>⏸️ <strong>Clear rules</strong> for pauses, substitutes and disconnects, decided on the spot.</li>
                <li>🏆 <strong>Results that can’t be disputed</strong>, for cups and serious teams.</li>
              </ul>
            </div>
            <div class="premium-card">
              <div class="premium-badge">COMING SOON</div>
              <h3>Want to be a match admin?</h3>
              <p>We’re looking for experienced, fair CS2 players to officiate Premium matches. Tell us about yourself: your CS2 experience, languages, country and when you’re available.</p>
              <div class="actions"><a class="btn btn-green" href="/contact?topic=admin">Apply to be an admin</a><a class="btn btn-dark" href="mailto:contact@cleanlobby.com?subject=Premium%20match%20admin">Email us</a></div>
              <p class="muted small" style="margin:12px 0 0">Interested in Premium for your team? Same address: contact@cleanlobby.com</p>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="cta">
            <h2>Your five is waiting.</h2>
            <p>Build your 5-stack, queue, and play a team that got here the same way you did.</p>
            <div class="actions"><a class="btn btn-green" href="/login" data-guest-cta>Find a trusted five</a><a class="btn btn-dark" href="/teams">Browse teams</a></div>
          </div>
          <p class="small muted" style="margin-top:22px;text-align:center">⚠️ Beta: features and matchmaking rules may change during testing. CleanLobby is a reputation layer, not an anti-cheat, and can't guarantee a player is cheat-free. Cheaters get reported, rated down and removed.</p>
        </div>
      </div>`);

    fillLiveStats();

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
    ['1-sign-in',496,434,'Sign in with Steam','Click <strong>Sign in with Steam</strong>. You log in on Steam’s own website: check the address bar says <code>steamcommunity.com</code>. CleanLobby only receives your public SteamID. It never sees your password and can’t touch your inventory or trades.'],
    ['2-pick-username',436,366,'Pick your username','First time only: choose a CleanLobby username. Email is optional (for match notifications). Confirm you’re 16 or older and accept the Terms.'],
    ['3-profile-setup',784,647,'Set up your player profile','Country (the beta is open in 12 countries; it decides which teams you can play: only ones close enough for good ping), main role and the languages you speak (your teammates need one in common). Your CS2 Premier rating is read from Leetify automatically. Teams see this when they look for players.'],
    ['4-build-team',1061,616,'Build your five','Create a team and invite players by their CleanLobby username, or find them on <a href="/players">Find Players</a>. Prefer joining a team? Browse <a href="/teams">Find a Team</a> and ask to join. An open team disbands after 6 hours without a new player.'],
    ['5-full-team-queue',705,619,'Five players? Find a match','When your team has 5 players, the captain clicks <strong>Find match</strong>. Everyone must meet the CleanLobby requirements: Steam account at least 2 years old, 500+ hours of CS2, no recent VAC or game ban.'],
    ['6-searching',705,677,'Searching for an opponent','CleanLobby looks for another full team close enough for good ping (their players’ countries within about 2,500 km of yours) with a similar Premier rating. This runs every 30 seconds. After 2 hours without a match, your team leaves the queue.'],
    ['7-match-found',1061,594,'Match found: captains accept','Both captains have <strong>5 minutes</strong> to accept. Declining or letting the time run out counts against the captain’s reliability.'],
    ['8-match-room',1061,1088,'Play through CS2 Private Matchmaking','Each captain invites their 4 teammates to a <strong>CS2 party</strong> (use the Steam buttons). One captain creates a <em>Private Matchmaking Pool</em> in CS2 and pastes the code here. The other captain enters it with <em>Manually Enter a Code</em>. Both parties press <strong>GO</strong>. Optional: a captain can share a Discord voice channel that only their own team sees.'],
    ['9-result-and-ratings',1061,936,'Report the score, then vote','After the game, both captains report the score. When they match, the result is final and everyone has <strong>48 hours</strong> to vote 👍 or 👎 on the players they played with: teammates on comms, teamplay and attitude, opponents on attitude and sportsmanship. Skill isn’t voted on: that’s your Premier rating. Different scores go to an admin.'],
    ['10-trust-score',1061,454,'Build your Trust Score','Your Trust Score (0–100) combines your Steam history, 👍/👎 votes from people you played with, reliability and matches played. Your profile also shows the % of 👍 for each aspect. It’s public on your profile and helps teams decide who to play with. <strong>60 and above is good.</strong> See <a href="#trust-score">how it works and how to raise it</a>.']
  ];
  // French screenshots (GUIDE_LANG=fr node scripts/guide-screenshots.mjs): id -> [width, height]
  const GUIDE_SIZES_FR={'1-sign-in':[496,434],'2-pick-username':[436,366],'3-profile-setup':[784,677],'4-build-team':[1061,631],'5-full-team-queue':[705,619],'6-searching':[705,677],'7-match-found':[1061,614],'8-match-room':[1061,1111],'9-result-and-ratings':[1061,956],'10-trust-score':[1061,454]};
  const guideImg=id=>{ const g=GUIDE_STEPS.find(s=>s[0]===id), fr=(LANG==='fr'||appPath()==='/test')&&GUIDE_SIZES_FR[id];
    return { src:`/img/guide/${fr?'fr/':''}${id}.webp`, w:fr?fr[0]:g[1], h:fr?fr[1]:g[2] }; };
  const GUIDE_FAQ=[
    ['Can I play Wingman (2v2)?','Yes. When you create a team, pick <strong>Wingman 2v2</strong> instead of 5v5, invite your duo partner, and click <strong>Find match</strong>. Same requirements, same Trust Score and votes; you’re only matched against other Wingman duos. In the match room, the host picks <strong>Wingman</strong> when creating the Private Matchmaking pool. You can be in one team at a time, either 5v5 or Wingman.'],
    ['Is signing in with Steam safe?','Yes. You sign in on steamcommunity.com, never on CleanLobby. We only receive your public SteamID. CleanLobby will never ask for your Steam Guard code, an API key or your trade link. If a page asks for those, it isn’t us.'],
    ['Why can’t I play yet?','Your Steam profile and game details must be public so we can check the requirements (2+ year old account, 500+ hours of CS2, no VAC or game ban in the last 2 years). The Play page shows which check is missing. After changing your Steam privacy, wait a few minutes and click Check again.'],
    ['Does it cost anything?','No. CleanLobby is free and stays free. Premium officiated matches, when they launch, will be an optional extra.'],
    ['Does a CleanLobby match change my CS Rating?','No. CS2 Private Matchmaking is unrated in CS2. CleanLobby keeps its own results and Trust Score.'],
    ['What if the other team doesn’t show up, or the captains disagree?','If only one captain reports a score within 6 hours, that score counts. If the scores don’t match, an admin decides. You can also <a href="/contact">contact us</a> with details.'],
    ['What is a good Trust Score?','<strong>60 and above is good</strong>, 75 and above is excellent. 40–59 is fair, under 40 is low. A new player with a solid Steam account usually starts around 65. A VAC or game ban in the last 2 years caps the score at 20. <a href="#trust-score">How it’s calculated</a>.'],
    ['How do I raise my Trust Score?','Play matches to the end, report the score, and vote on everyone you played with after each match: 👍/👎 votes from other players are 30% of the score. Accept matches in time and don’t leave a queued team. Your profile shows tips for your own score. <a href="#trust-score">Details</a>.'],
    ['Which countries can play?','During the beta: Morocco, France, Belgium, Switzerland, Luxembourg, Monaco, Spain, Andorra, Portugal, the United Kingdom, Ireland and Malta. We start small so matches have good ping and teammates share a language (English, French, Spanish or Portuguese). More countries will open later: <a href="/contact">tell us where you play</a>.'],
    ['Where does my Premier rating come from?','From your <a href="https://leetify.com/" target="_blank" rel="noopener">Leetify</a> profile, read automatically and refreshed every day, so nobody can type a fake one. No Leetify yet? Sign in once at leetify.com with Steam and play a Premier match, then click “Check Leetify again” on the Play page.'],
    ['What is Premium?','Coming soon: officiated matches on a private CS2 server with a real admin watching, where only the 10 players on the roster can connect. The admin can ask any player to stream their screen during the match, can kick anyone, and finds a replacement on the spot if someone is caught cheating. 5v5 tournaments are coming up too. Want to be an admin, or interested for your team? <a href="/contact?topic=admin">Contact us</a>.'],
    ['How do I report a cheater?','Use the <a href="/contact">Contact page</a> (topic: Report a player) with their CleanLobby name and the match. CleanLobby is a reputation layer, not an anti-cheat.']
  ];
  function guidePage(){
    layout('How CleanLobby works',`<div class="container guide">
      <div class="eyebrow">PLAYER GUIDE</div><h1>How CleanLobby works</h1>
      <p class="subtitle">From signing in to your first match, step by step. Getting set up takes about 5 minutes.</p>
      <nav class="guide-toc" aria-label="Steps">${GUIDE_STEPS.map(([,,,t],i)=>`<a href="#step-${i+1}">${i+1}. ${esc(t)}</a>`).join('')}<a href="#trust-score">Trust Score</a><a href="#faq">Questions</a></nav>
      ${GUIDE_STEPS.map(([id,w,h,t,text],i)=>`<section class="guide-step" id="step-${i+1}">
        <div class="guide-text"><div class="step-num">STEP ${i+1}</div><h2>${esc(t)}</h2><p>${text}</p></div>
        <figure><img src="${guideImg(id).src}" width="${guideImg(id).w}" height="${guideImg(id).h}" loading="${i<2?'eager':'lazy'}" alt="${esc(t)}: screenshot of CleanLobby"><figcaption class="muted small">Example players and teams.</figcaption></figure>
      </section>`).join('')}
      <section class="panel guide-trust" id="trust-score" style="margin-top:28px">
        <div class="step-num">TRUST SCORE</div><h2>How the Trust Score works</h2>
        <p>Every player has a public score from 0 to 100. It tells teams how much they can count on you: is this a real, established account, do people enjoy playing with you, and do you show up? It is not a skill rating: skill is your Premier rating.</p>
        <div class="trust-scale" aria-label="Score bands">
          <div style="--c:var(--danger);flex:40"><b>0–39</b>Low</div><div style="--c:#f2c94c;flex:20"><b>40–59</b>Fair</div><div style="--c:var(--ok);flex:15"><b>60–74</b>Good</div><div style="--c:var(--ok);flex:25"><b>75–100</b>Excellent</div>
        </div>
        <p><strong>60 and above is good.</strong> A new player with a solid Steam account usually starts around 65, then the score moves with every match.</p>
        <table class="trust-table">
          <tr><th>Part</th><th>Weight</th><th>What counts</th><th>How to raise it</th></tr>
          <tr><td><strong>Identity</strong></td><td>35%</td><td>Your Steam account: age (full at 6 years), CS2 hours (full at 2,000 h), Steam level (full at 25). Only counts once you signed in through Steam.</td><td>Keep your Steam profile and game details public. It grows by itself as your account ages.</td></tr>
          <tr><td><strong>Peer reputation</strong></td><td>30%</td><td>👍/👎 votes after each match, for 48 hours. Teammates vote on <strong>comms</strong>, <strong>teamplay</strong> and <strong>attitude</strong>; opponents on <strong>attitude</strong> and <strong>sportsmanship</strong>. Skill isn’t voted on (that’s the Premier rating). Votes from trusted, older accounts count more, they fade after a few months, and the same small group voting for each other again and again counts less. Your profile shows the % of 👍 per aspect.</td><td>Communicate, play your role, stay respectful and stay to the end. Vote on everyone after each match: they vote on you too.</td></tr>
          <tr><td><strong>Reliability</strong></td><td>25%</td><td>Showing up. Declining a match, letting it expire, or leaving a team that’s in the queue count against you. Incidents fade after about 3 months. New players start at 80.</td><td>Accept matches within 5 minutes and don’t leave a queued team.</td></tr>
          <tr><td><strong>Track record</strong></td><td>10%</td><td>Matches you played to the end with an agreed score (full at 30 matches).</td><td>Play matches through and make sure your captain reports the score.</td></tr>
        </table>
        <p><strong>What can cap it:</strong> a VAC or game ban in the last 2 years caps the score at 20. Older bans take off 15 points each (up to 30). A Steam community ban caps it at 40.</p>
        <p class="muted small">The label next to the score (New player, Building, Established) says how much history backs it. A new player’s score can still move a lot. CleanLobby is a reputation layer, not an anti-cheat.</p>
      </section>
      <section class="panel" id="faq" style="margin-top:28px"><h2>Questions</h2>${GUIDE_FAQ.map(([q,a])=>`<details class="faq"><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</section>
      <div class="cta" style="margin-top:24px"><h2>Ready?</h2><p>Sign in, set up your profile and build your five.</p><div class="actions"><a class="btn btn-green" href="/login" data-guest-cta>Sign in with Steam</a></div></div>
    </div>`,'guide');
  }

  // ---------- Test day guide (French, shared with testers only; not indexed) ----------
  function testPage(){
    const img=(id,alt)=>{ const g=GUIDE_STEPS.find(s=>s[0]===id), gi=g&&guideImg(id); return g?`<figure><img src="${gi.src}" width="${gi.w}" height="${gi.h}" loading="lazy" alt="${esc(alt)}"><figcaption class="muted small">Joueurs et équipes d’exemple.</figcaption></figure>`:''; };
    const step=(n,title,body,shot,alt)=>`<section class="guide-step"><div class="guide-text"><div class="step-num">${n}</div><h2>${title}</h2>${body}</div>${shot?img(shot,alt):'<div></div>'}</section>`;
    layout('Guide du testeur',`<div class="container guide test-guide" data-no-i18n>
      <div class="eyebrow">JOUR DE TEST · BÊTA</div><h1>Guide du testeur</h1>
      <p class="subtitle">Merci de tester CleanLobby ! Voici tout ce qu’il faut faire, avant et pendant le test. Garde cette page ouverte sur ton téléphone le jour J.</p>
      <div class="notice">📅 <strong>Date, heure et équipes :</strong> annoncées sur le groupe WhatsApp / Discord. Sois connecté sur Steam et CS2 <strong>15 minutes avant</strong>.</div>
      <nav class="guide-toc" aria-label="Sommaire"><a href="#avant">1. Avant le test</a><a href="#jour-j">2. Le jour J</a><a href="#observer">3. Ce qu’on observe</a><a href="#depannage">4. Si ça bloque</a><a href="#apres">5. Après le test</a></nav>

      <h2 id="avant" class="test-h">1. Avant le test : à faire dès maintenant</h2>
      <p class="muted">Ça prend 5 minutes. Fais-le avant le jour J : s’il y a un souci avec ton compte, on a le temps de le régler.</p>
      ${step('ÉTAPE 1','Connecte-toi avec Steam',`<p>Va sur <a href="/fr/login"><strong>cleanlobby.com/fr</strong></a> et clique sur <strong>Se connecter via Steam</strong>. Tu te connectes sur le site officiel de Steam : vérifie que l’adresse affiche <code>steamcommunity.com</code>. CleanLobby ne voit jamais ton mot de passe.</p><p>Première fois : choisis ton pseudo CleanLobby et accepte les conditions.</p>`,'1-sign-in','Connexion avec Steam')}
      ${step('ÉTAPE 2','Rends ton profil Steam public',`<p>On vérifie que ton compte est réel : <strong>compte Steam de 2 ans ou plus</strong>, <strong>500 heures de CS2</strong> ou plus, <strong>pas de ban VAC ou de jeu récent</strong>. Pour ça, ton profil et tes détails de jeu doivent être publics :</p><p>Steam → Modifier le profil → Paramètres de confidentialité → <strong>Mon profil : Public</strong> et <strong>Détails de jeu : Public</strong>. <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener">Ouvrir les paramètres Steam</a></p>`)}
      ${step('ÉTAPE 3','Complète ton profil de joueur',`<p>Sur la page <a href="/fr/play">Jouer</a> : ton <strong>pays</strong> (la bêta est ouverte dans 12 pays), ton <strong>rôle</strong> et <strong>toutes les langues que tu parles</strong>. Coche-les toutes : tes coéquipiers doivent avoir une langue en commun avec toi.</p>`,'3-profile-setup','Profil de joueur')}
      ${step('ÉTAPE 4','Vérifie ton rating Premier',`<p>Ton rating Premier vient automatiquement de <strong>Leetify</strong>, personne ne peut le truquer. Pas de compte Leetify ? Connecte-toi une fois sur <a href="https://leetify.com/" target="_blank" rel="noopener">leetify.com</a> avec Steam, puis clique sur <strong>Revérifier Leetify</strong> sur la page Jouer.</p><p>Pas de rating Premier du tout ? Tu peux quand même jouer : tu seras « Non classé ».</p>`)}
      ${step('ÉTAPE 5','Tout doit être ✅',`<p>Sur la page <a href="/fr/play">Jouer</a>, ton profil doit afficher <strong>VÉRIFIÉ · Remplit les conditions CleanLobby</strong>. Un ❌ quelque part ? Le message te dit quoi corriger. Toujours bloqué ? Envoie une capture d’écran sur le groupe.</p>`)}

      <h2 id="jour-j" class="test-h">2. Le jour J</h2>
      ${step('CAPITAINES','Montez vos équipes',`<p>Chaque capitaine crée son équipe sur la page <a href="/fr/play">Jouer</a> et invite ses 4 joueurs avec leur <strong>pseudo CleanLobby</strong>. Les joueurs acceptent l’invitation sur leur page Jouer.</p><p>Quand l’équipe a 5 joueurs, le capitaine clique sur <strong>Trouver un match</strong>.</p>`,'4-build-team','Monter son équipe')}
      ${step('MATCH TROUVÉ','Les deux capitaines acceptent',`<p>Quand un adversaire est trouvé, les deux capitaines ont <strong>5 minutes</strong> pour cliquer sur <strong>Accepter</strong>. Restez sur la page Jouer pendant la recherche.</p>`,'7-match-found','Match trouvé')}
      ${step('DANS CS2','Une party de 5 par équipe, un seul code',`<ol class="test-list">
          <li><strong>Chaque capitaine</strong> invite ses 4 coéquipiers dans sa <strong>party CS2</strong> (boutons Steam dans le salon du match). Chaque équipe doit être <strong>une seule party de 5</strong>, sinon CS2 mélange les joueurs.</li>
          <li><strong>Un capitaine</strong> crée le salon : Play → Matchmaking → Private Matchmaking → <strong>Create a Private Matchmaking Pool</strong>, copie le code complet et le colle sur CleanLobby.</li>
          <li><strong>L’autre capitaine</strong> copie le code depuis CleanLobby et l’entre avec <strong>Manually Enter a Code</strong>.</li>
          <li><strong>Les deux parties appuient sur GO.</strong> Le match démarre quand les 10 joueurs cherchent.</li></ol>
          <p class="muted">Option : partagez un salon vocal Discord pour votre équipe dans le salon du match. Seule votre équipe le voit.</p>`,'8-match-room','Salon du match')}
      ${step('APRÈS LA PARTIE','Score, puis votes',`<p>Les <strong>deux capitaines déclarent le score</strong> (le même !). Ensuite, <strong>tout le monde vote</strong> 👍 ou 👎 pendant 48 heures : coéquipiers sur les comms, le jeu d’équipe et l’attitude, adversaires sur l’attitude et le fair-play. Le bouton <strong>👍 Tous ceux pour qui je n’ai pas voté</strong> fait tout en un clic, puis change ce que tu veux.</p>`,'9-result-and-ratings','Score et votes')}

      <h2 id="observer" class="test-h">3. Ce qu’on observe pendant le test</h2>
      <div class="panel test-box"><ul class="test-list">
        <li>Est-ce que <strong>les deux parties de 5 restent bien ensemble</strong> avec un seul code ? Personne ne se retrouve dans la mauvaise équipe ?</li>
        <li><strong>Combien de temps</strong> entre « Match trouvé » et le début de la partie ?</li>
        <li>Tout ce qui était <strong>confus, lent ou cassé</strong> : fais une capture d’écran sur le moment.</li>
      </ul></div>

      <h2 id="depannage" class="test-h">4. Si ça bloque</h2>
      <div class="test-faq">
        <details class="faq"><summary>Le code ne marche pas</summary><p>Vérifie que le code a été copié en entier (avec les tirets). Le capitaine qui a créé le salon peut <strong>Remplacer</strong> le code sur CleanLobby à tout moment.</p></details>
        <details class="faq"><summary>CS2 a mélangé les joueurs entre les équipes</summary><p>Quittez, et vérifiez que <strong>chaque équipe est une seule party de 5</strong> avant d’appuyer sur GO. Puis relancez avec le même code.</p></details>
        <details class="faq"><summary>Un joueur de l’équipe n’est pas là</summary><p>Prévenez le groupe tout de suite. Pendant le test, on ne fait pas jouer quelqu’un qui n’est pas dans l’équipe sur CleanLobby.</p></details>
        <details class="faq"><summary>Les capitaines ont déclaré des scores différents</summary><p>Le match passe en « Résultat contesté » et un admin tranche. On est en ligne pendant tout le test.</p></details>
        <details class="faq"><summary>Je ne peux pas rejoindre ou créer d’équipe</summary><p>Ton compte ne remplit pas encore une condition : regarde la liste ✅/❌ sur la page Jouer. Profil Steam rendu public à l’instant ? Attends quelques minutes et clique sur <strong>Revérifier</strong>.</p></details>
        <details class="faq"><summary>Un bug ou une erreur</summary><p>Capture d’écran + un message sur le groupe, ou via la <a href="/fr/contact">page Contact</a>. Dis ce que tu faisais juste avant.</p></details>
      </div>

      <h2 id="apres" class="test-h">5. Après le test : ton avis compte</h2>
      <div class="panel test-box"><p style="margin-top:0">Réponds à ces questions sur le groupe ou via la <a href="/fr/contact">page Contact</a> :</p><ol class="test-list">
        <li>Qu’est-ce qui était <strong>confus</strong> ou compliqué ?</li>
        <li>Quels <strong>bugs</strong> as-tu vus ?</li>
        <li>Est-ce que tu <strong>rejouerais chaque semaine</strong> sur CleanLobby ?</li>
        <li><strong>Premium</strong> : un match sur serveur privé avec un vrai admin (stream d’écran, kick des cheaters). Ça t’intéresse ? <strong>Combien</strong> serais-tu prêt à payer ?</li>
        <li>Ce qui t’a <strong>plu</strong>, et ce que tu changerais en premier.</li>
      </ol></div>
      <div class="cta" style="margin-top:24px"><h2>Prêt ?</h2><p>Connecte-toi, complète ton profil et vérifie que tout est ✅.</p><div class="actions"><a class="btn btn-green" href="/fr/play">Aller sur la page Jouer</a><a class="btn btn-dark" href="/fr/guide">Le guide complet</a></div></div>
    </div>`,'guide');
  }

  // ---------- Contact page ----------
  async function contactPage(){
    layout('Contact',`<div class="container" style="max-width:760px">
      <div class="eyebrow">CONTACT</div><h1>Contact CleanLobby</h1>
      <p class="subtitle">Questions, problems or ideas: we read every message.</p>
      <div class="panel">
        <div class="code-box"><div><div class="muted small">Email us</div><code id="contact-email">contact@cleanlobby.com</code></div><button class="btn btn-small btn-green" type="button" id="copy-email">Copy</button></div>
        <ul class="contact-topics">
          <li><strong>Help with your account</strong>: sign-in, profile, Steam checks</li>
          <li><strong>Report a player</strong>: cheating, smurfing, abuse. Include their CleanLobby name and the match.</li>
          <li><strong>Disputed match result</strong>: tell us the match and the real score</li>
          <li><strong>Become a Premium match admin</strong>: your CS2 experience, languages, country and availability</li>
          <li><strong>Partnerships and sponsoring</strong>: creators, communities, brands</li>
          <li><strong>Your data</strong>: a copy of it or a correction. You can delete your account yourself on the <a href="/account" style="color:var(--accent)">Account page</a>.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Send a message</h2>
        <form id="contact-form" class="form-grid">
          <div><label for="contact-topic">What's it about?</label><select id="contact-topic" name="topic" required></select></div>
          <div><label for="contact-reply">Your email (to get a reply)</label><input class="input" id="contact-reply" name="email" type="email" placeholder="you@example.com" autocomplete="email"></div>
          <div class="full"><label for="contact-message">Message</label><textarea class="input" id="contact-message" name="message" rows="6" minlength="10" maxlength="4000" required placeholder="What happened, and what can we do?"></textarea></div>
          <div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
          <div class="full"><button class="btn btn-green">Send message</button> <span class="muted small" style="margin-left:8px">Signed in? We'll see your CleanLobby username, so you don't need to explain who you are.</span></div>
        </form>
      </div></div>`);
    const info=await get('/api/contact/info').catch(()=>null);
    if(info){ document.getElementById('contact-email').textContent=info.email; document.getElementById('contact-topic').innerHTML=info.topics.map(t=>`<option ${new URLSearchParams(location.search).get('topic')==='admin'&&/admin/i.test(t)?'selected':''}>${esc(t)}</option>`).join(''); }
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
    const side=(t,right)=>t?`<a class="match-team${right?' right':''}" href="/team/${t.id}">${right?`<strong>${nm(t.name)}</strong> ${flags(t.country,t.language)}`:`${flags(t.country,t.language)} <strong>${nm(t.name)}</strong>`}</a>`:'<span class="muted">—</span>';
    const ago=ts=>{ if(!ts) return ''; const m=Math.round((Date.now()-ts)/60000); return m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`; };
    const row=(m,live)=>`<div class="match-row">${side(m.team_a)}<div class="match-mid">${m.team_a?.mode==='2v2'?modeBadge(m.team_a)+' ':''}${live?'<span class="status green">LIVE</span>':`<span class="score">${m.score_a} – ${m.score_b}</span>`}<div class="muted small">${live?'Started '+ago(m.confirmed_at):ago(m.completed_at)}</div></div>${side(m.team_b,true)}</div>`;
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
    t.textContent=window.Stack5T?window.Stack5T(text):text;
    document.body.appendChild(t);
    setTimeout(()=>t.remove(),4000);
  }

  const STATUS={
    OPEN:['Building roster',''], READY:['In queue','amber'], MATCHED:['Match found','green'],
    MATCH_CONFIRMED:['In a live match','green'], FINISHED:['Finished',''], CANCELLED:['Disbanded','']
  };
  function statusBadge(s){ const [label,cls]=STATUS[s]||[s,'']; return `<span class="status ${cls}">${esc(label)}</span>`; }
  const ROLES=['Rifler','AWPer','Entry','IGL','Support','Lurker'];
  const LANGS=[['EN','English'],['FR','Français'],['ES','Español'],['PT','Português']];   // beta languages
  // Countries open in the beta (same list as BETA_COUNTRIES in src/regions.js).
  const BETA=[['MA','Morocco'],['FR','France'],['BE','Belgium'],['CH','Switzerland'],['LU','Luxembourg'],['MC','Monaco'],['ES','Spain'],['AD','Andorra'],['PT','Portugal'],['GB','United Kingdom'],['IE','Ireland'],['MT','Malta']];
  const COUNTRY_FR={MA:'Maroc',FR:'France',BE:'Belgique',CH:'Suisse',LU:'Luxembourg',MC:'Monaco',ES:'Espagne',AD:'Andorre',PT:'Portugal',GB:'Royaume-Uni',IE:'Irlande',MT:'Malte'};
  const countryName=c=>LANG==='fr'&&COUNTRY_FR[c]||(BETA.find(x=>x[0]===c)||[c,c||''])[1];
  const countryOptions=(label)=>`<option value="">${label}</option>${BETA.map(([c])=>`<option value="${c}">${countryName(c)}</option>`).join('')}`;
  const btn=(label,act,cls='btn-dark',data={})=>`<button class="btn btn-small ${cls}" data-act="${act}" ${Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}</button>`;
  const realSteam=p=>/^https:\/\/(www\.)?steamcommunity\.com\//.test(p?.steam_url||'');
  // Names are shown as typed, never translated.
  const nm=x=>`<span data-no-i18n>${esc(x)}</span>`;
  const playerLink=p=>`<a href="/player/${encodeURIComponent(p.display_name)}"><strong>${nm(p.display_name)}</strong></a>`;

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
        <p class="muted">Sign in through Steam, set up your player profile and build your five. New here? Read <a href="/guide" style="color:var(--accent)">how CleanLobby works</a>.</p>
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
    // FACEIT is shown live only (its API terms forbid keeping a copy).
    get(`/api/players/${d.player.id}/faceit`).then(f=>{
      const el=document.getElementById('my-faceit');
      if(el && f.available && !f.none) el.innerHTML=`FACEIT <strong>level ${esc(f.level??'—')}</strong> · Elo ${esc(f.elo??'—')} <span class="leetify-attr">Live data from FACEIT</span>`;
    }).catch(()=>{});

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
      <p class="muted" style="margin-top:0">To keep new and throwaway accounts out of matches, CleanLobby needs a Steam account with real CS2 history. We check public Steam data only. We never need your password.</p>
      <div style="margin-top:10px">${rows}</div>
      <p class="muted small" style="margin-top:14px">Made your profile or game details public? Steam can take a few minutes to update, then check again.
        <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener" style="color:var(--accent)">Open Steam privacy settings</a></p>
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
    const myVotes=m.my_votes||{};
    // Scores are stored team A first; show them from this player's side.
    const mySide=([a,b])=>iAmA?[a,b]:[b,a];
    const parse=r=>{ const x=/^(\d+)-(\d+)$/.exec(r||''); return x?[Number(x[1]),Number(x[2])]:null; };
    const myReport=parse(iAmA?m.report_a:m.report_b), theirReport=parse(iAmA?m.report_b:m.report_a);

    const teamHead=t=>`<h3>${flags(mostCommon(t?.members,'country'),sharedLangs(t?.members))} ${esc(t?.name)}</h3>`;
    const roster=(t,vote)=>(t?.members||[]).map(p=>`
      <div class="row">
        <div>${flags(p.country,langsOf(p))} ${playerLink(p)}<div class="muted small">${premier(p.premier_rating)} · ${esc(p.role||'—')}${t.captain_id===p.id?' · Captain':''}</div></div>
        <div class="row-actions">
          ${realSteam(p)?`<a class="btn btn-small btn-outline" href="${esc(p.steam_url)}" target="_blank" rel="noopener">Steam</a>`:''}
        </div>
        ${vote && p.id!==d.player.id?`<div class="votes">${(t.id===m.my_team_id?TEAMMATE_ASPECTS:OPPONENT_ASPECTS).map(a=>{ const v=myVotes[p.id]?.[a], [i,n]=ASPECT_INFO[a];
          return `<span class="vote"><span class="vote-label">${i} ${n}</span><button class="vbtn${v===1?' on-up':''}" data-act="vote" data-id="${m.id}" data-arg="${p.id}:${a}:${v===1?0:1}" aria-label="${n} thumbs up for ${esc(p.display_name)}" aria-pressed="${v===1}">👍</button><button class="vbtn${v===-1?' on-down':''}" data-act="vote" data-id="${m.id}" data-arg="${p.id}:${a}:${v===-1?0:-1}" aria-label="${n} thumbs down for ${esc(p.display_name)}" aria-pressed="${v===-1}">👎</button></span>`; }).join('')}</div>`:''}
      </div>`).join('');
    const reportForm=label=>`<form data-form="report" data-id="${m.id}" class="score-form">
        <label><span class="muted small">${nm(mine?.name)}</span><input class="input" name="my_score" type="number" inputmode="numeric" min="0" max="60" placeholder="13" required></label>
        <span class="score-dash">–</span>
        <label><span class="muted small">${nm(other?.name)}</span><input class="input" name="their_score" type="number" inputmode="numeric" min="0" max="60" placeholder="9" required></label>
        <button class="btn btn-green btn-small">${label}</button></form>`;

    let head, body='';
    if(m.status==='PENDING'){
      head=`<div class="eyebrow">${mine?.mode==='2v2'?'WINGMAN · ':''}MATCH FOUND · ${m.compatibility}% COMPATIBLE</div><h2 style="margin-top:8px">${nm(mine?.name)} vs ${esc(other?.name)}</h2>`;
      body=m.expires_at?`<p class="muted" style="margin-top:14px">Both captains must accept within ${countdown(m.expires_at)}. If time runs out, a team that didn't accept goes back to recruiting.</p>`:'';
      if(isCaptain && !myAccepted) body+=`<div class="actions" style="margin-top:12px">${btn('Accept match','accept-match','btn-green',{id:m.id,arg:m.my_team_id})}${btn('Decline','decline-match','btn-danger',{id:m.id,confirm:'Decline this match? Your team will leave the queue.'})}</div>`;
      else if(myAccepted) body+=`<p class="muted" style="margin-top:14px">Your team accepted. Waiting for the other captain…</p>`;
      else body+=`<p class="muted" style="margin-top:14px">Waiting for your captain to accept…</p>`;
    } else if(m.status==='CONFIRMED'){
      const wing=(mine?.mode||other?.mode)==='2v2';
      head=`<div class="eyebrow">${wing?'WINGMAN · ':''}MATCH LIVE</div><h2 style="margin-top:8px">${nm(mine?.name)} vs ${esc(other?.name)}</h2>
        <p class="muted" style="margin-top:0">You play through CS2's own <strong>Private Matchmaking</strong>. Follow these steps:</p>
        <ol class="match-steps">
          ${wing
            ?`<li><strong>Each captain:</strong> invite your duo partner to your CS2 party (Steam buttons below). Each team must be <strong>one 2-player party</strong>, or CS2 may mix players between teams.</li>
          <li><strong>One captain hosts:</strong> in CS2, open <em>Play → Matchmaking → Private Matchmaking → Create a Private Matchmaking Pool</em>, choose <strong>Wingman</strong> as the game mode, copy the full code and paste it below.</li>
          <li><strong>The other captain:</strong> <em>Private Matchmaking → Manually Enter a Code</em>, paste the code, and check that Wingman is selected.</li>
          <li><strong>Both parties press GO.</strong> The match starts when all 4 players are searching. It's unrated in CS2; CleanLobby records the result.</li>`
            :`<li><strong>Each captain:</strong> invite your 4 teammates to your CS2 party (Steam buttons below). Each team must be <strong>one 5-player party</strong>, or CS2 may mix players between teams.</li>
          <li><strong>One captain hosts:</strong> in CS2, open <em>Play → Matchmaking → Private Matchmaking → Create a Private Matchmaking Pool</em>, copy the full code and paste it below.</li>
          <li><strong>The other captain:</strong> <em>Private Matchmaking → Manually Enter a Code</em>, paste the code.</li>
          <li><strong>Both parties press GO.</strong> The match starts when all 10 players are searching. It's unrated in CS2; CleanLobby records the result.</li>`}
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
        body+=`<p class="muted" style="margin-top:16px">After the game, your captain reports the score. Then you can vote 👍/👎 on everyone you played with (48 hours): votes are 30% of the Trust Score.</p>`;
      }
    } else if(m.status==='DISPUTED'){
      head=`<div class="eyebrow" style="color:#ffb3b9">RESULT DISPUTED</div><h2 style="margin-top:8px">${nm(mine?.name)} vs ${esc(other?.name)}</h2>
        <p class="muted">The captains reported different scores${myReport&&theirReport?` (your side: ${myReport[0]}–${myReport[1]}, other side: ${theirReport[0]}–${theirReport[1]})`:''}. An admin will decide. Until then the match doesn't count.</p>`;
      if(isCaptain) body=`<p class="muted small">Made a mistake? Correct your report. If both reports match, the result is confirmed.</p>${reportForm('Correct report')}`;
    } else if(m.status==='COMPLETED'){
      const [me,them]=mySide([m.score_a,m.score_b]);
      head=`<div class="eyebrow">MATCH FINISHED</div>
        <h2 style="margin-top:8px">${nm(mine?.name)} <span class="score">${me} – ${them}</span> ${esc(other?.name)}</h2>
        <p class="muted">${me>them?'🏆 Your team won.':me<them?'Your team lost.':'Draw.'} Vote 👍 or 👎 on the players you played with: teammates on comms, teamplay and attitude, opponents on attitude and sportsmanship. Votes are 30% of everyone’s Trust Score, and they vote on you too. <a href="/guide#trust-score" style="color:var(--accent)">How it works</a></p>
        <div class="actions" style="margin-top:10px">${btn('👍 Everyone I haven’t voted on','votes-all-up','btn-green',{id:m.id})}<span class="muted small" style="align-self:center">⏳ Voting closes in ${countdown(m.vote_deadline)}. You can change any vote until then.</span></div>`;
    } else if(m.status==='NO_RESULT'){
      head=`<div class="eyebrow">MATCH CLOSED</div><h2 style="margin-top:8px">${nm(mine?.name)} vs ${esc(other?.name)}</h2>
        <p class="muted">No result was reported in time, so this match doesn't count for anyone.</p>`;
    }
    const canRate=m.status==='COMPLETED' && (!m.vote_deadline || m.vote_deadline>Date.now());
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
        <h2>Create your team</h2>
        <form data-form="create-team" class="form-grid">
          <div class="full"><label>Mode</label><div class="mode-pick">
            <label><input type="radio" name="mode" value="5v5" checked> <span><strong>5v5</strong><small class="muted">Competitive · 5 players</small></span></label>
            <label><input type="radio" name="mode" value="2v2"> <span><strong>Wingman 2v2</strong><small class="muted">2 players · you + your duo</small></span></label>
          </div></div>
          <div class="full"><label>Team name</label><input class="input" name="name" maxlength="40" minlength="2" placeholder="e.g. Casablanca Kings" required></div>
          <div><label>Premier rating range</label><div style="display:flex;gap:8px">
            <input class="input" name="min_rating" type="number" min="0" max="40000" step="500" value="0" aria-label="Lowest Premier rating">
            <input class="input" name="max_rating" type="number" min="0" max="40000" step="500" value="40000" aria-label="Highest Premier rating"></div></div>
          <div class="full"><button class="btn btn-green">Create team</button>
            <span class="muted small" style="margin-left:10px">or <a href="/teams" style="color:var(--accent)">browse teams</a> and request to join one.</span></div>
        </form>
      </div>`;
    }
    const captain=t.captain_id===me;
    const editable=['OPEN','READY'].includes(t.status);
    const members=t.members.map(p=>`
      <div class="row">
        <div>${playerLink(p)} ${languageFlags(langsOf(p))} ${p.id===t.captain_id?'<span class="status green">CAPTAIN</span>':''}
          <div class="muted small">${premier(p.premier_rating)} · ${esc(p.role||'—')} · Trust ${p.trust_score??'—'}</div></div>
        ${captain && p.id!==me && editable?`<div class="row-actions">
          ${btn('Make captain','transfer','btn-dark',{id:t.id,arg:p.id,confirm:`Make ${p.display_name} the captain?`})}
          ${btn('Remove','remove','btn-danger',{id:t.id,arg:p.id,confirm:`Remove ${p.display_name} from the team?`})}
        </div>`:''}
      </div>`).join('');
    const size=teamSizeOf(t);
    const empty=Array.from({length:Math.max(0,size-t.count)},()=>`<div class="row"><span class="muted">Open slot</span></div>`).join('');

    let controls='';
    if(t.status==='OPEN' && t.expires_at){
      controls+=`<p class="muted small" style="margin-top:12px">⏳ ${t.count<size?'Disbands in':'Queue within'} ${countdown(t.expires_at)} ${t.count<size?'unless a new player joins':'or the team is disbanded'}.</p>`;
    }
    if(captain && t.status==='OPEN'){
      controls+= t.count<size
        ? `<form data-form="invite" data-id="${t.id}" class="inline-form"><input class="input" name="username" placeholder="Invite by CleanLobby username" required><button class="btn btn-green btn-small">Invite</button></form>
           <p class="muted small" style="margin-top:8px">Or find players on <a href="/players" style="color:var(--accent)">Find Players</a>. You need ${size} players to queue.</p>`
        : `<div class="actions" style="margin-top:16px">${btn('Find match','queue','btn-green',{id:t.id})}</div>`;
    }
    if(t.status==='READY'){
      controls+=`<p style="margin-top:16px"><strong>Searching for an opponent…</strong> <span class="muted">Teams close enough for good ping are matched automatically.</span></p>`;
      if(t.queue_expires_at) controls+=`<p class="muted small">⏳ Leaves the queue in ${countdown(t.queue_expires_at)} if no match is found.</p>`;
      if(captain) controls+=`<div class="actions" style="margin-top:10px">${btn('Leave queue','unqueue','btn-dark',{id:t.id})}</div>`;
    }
    if(editable){
      controls+=`<div class="actions" style="margin-top:18px">${captain
        ? btn('Disband team','disband','btn-danger',{id:t.id,confirm:'Disband this team? All members will be released.'})
        : btn('Leave team','leave','btn-danger',{id:t.id,confirm:'Leave this team?'})}</div>`;
    }
    return `<div class="panel">
      <div class="card-top"><div><h2 style="margin:0">${nm(t.name)}</h2><div class="muted small">${modeBadge(t)} ${t.count}/${size} players · ${premierRange(t.min_rating,t.max_rating)}</div></div>${statusBadge(t.status)}</div>
      ${(()=>{ const sh=sharedLangs(t.members); return t.count<2?'':sh.length
        ?`<p class="small" style="margin:12px 0 0">🗣️ Everyone speaks ${languageFlags(sh)} <span class="muted">${esc(langNames(sh))}</span></p>`
        :'<p class="small" style="margin:12px 0 0;color:#f2c94c">⚠️ Your players don\'t share a language. Comms will be hard: check their languages before inviting more.</p>'; })()}
      <div style="margin-top:14px">${members}${empty}</div>
      ${controls}
    </div>`;
  }

  function sidePanel(d){
    const invites=d.invites.length?d.invites.map(i=>`
      <div class="row"><div><strong>${nm(i.team_name)}</strong><div class="muted small">${modeBadge(i)} ${i.count}/${teamSizeOf(i)} · from ${esc(i.invited_by)}</div></div>
        <div class="row-actions">${btn('Accept','accept-invite','btn-green',{id:i.id})}${btn('Decline','decline-invite','btn-dark',{id:i.id})}</div></div>`).join('')
      :'<p class="muted small">No pending invitations.</p>';
    let html=`<div class="panel"><h2>Invitations</h2>${invites}</div>`;
    if(d.team && d.team.captain_id===d.player.id && d.team.status==='OPEN'){
      const reqs=d.joinRequests.length?d.joinRequests.map(r=>`
        <div class="row"><div>${playerLink(r)} ${languageFlags(langsOf(r))}<div class="muted small">${premier(r.premier_rating)} · ${esc(r.role||'—')} · Trust ${r.trust_score??'—'}${(()=>{ const sh=sharedLangs(d.team.members); return !sh.length?'':langsOf(r).some(x=>sh.includes(x))?' · <span style="color:var(--ok)">speaks your team\'s language</span>':' · <span style="color:#f2c94c">no shared language</span>'; })()}</div></div>
          <div class="row-actions">${btn('Accept','accept-request','btn-green',{id:r.id})}${btn('Decline','decline-request','btn-dark',{id:r.id})}</div></div>`).join('')
        :'<p class="muted small">No one has asked to join yet.</p>';
      html+=`<div class="panel"><h2>Join requests</h2>${reqs}</div>`;
    }
    if(d.myRequests.length){
      html+=`<div class="panel"><h2>Your requests</h2>${d.myRequests.map(r=>`<div class="row"><span>${nm(r.team_name)}</span><span class="status amber">Pending</span></div>`).join('')}</div>`;
    }
    html+=`<div class="panel"><h2>Your profile</h2>
      <div class="muted small">${countryFlag(d.player.country)} ${esc(countryName(d.player.country))} · ${esc(d.player.role)}</div>
      <div class="small" style="margin-top:8px">Premier ${premier(d.player.premier_rating)} ${premierSource(d.player)}</div>
      <div class="small" id="my-faceit" style="margin-top:6px"></div>
      ${d.player.premier_rating==null?`<p class="small" style="color:#f2c94c;margin:10px 0 0">We read your Premier rating from <a href="https://leetify.com/" target="_blank" rel="noopener" style="color:var(--accent)">Leetify</a>, and it doesn’t have one for you yet. Sign in once at leetify.com with Steam and play a Premier match, then check again.</p>${btn('Check Leetify again','premier-leetify','btn-dark')}`:''}
      <form data-form="languages" style="margin-top:12px"><label class="field-label">Languages you speak</label>${languageBoxes(langsOf(d.player))}<button class="btn btn-dark btn-small" style="margin-top:8px">Save languages</button></form>
      <div class="muted small" style="margin-top:6px">${d.eligibility?.eligible?'<span class="status green">VERIFIED</span> Meets CleanLobby requirements':'<span class="status amber">NOT VERIFIED</span>'}</div>
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
    const steamField=`<div class="full"><label>Steam account</label><div class="input" style="display:flex;justify-content:space-between;align-items:center"><span>✅ Verified · ${esc(d.account.verified_steam_id)}</span><a href="https://steamcommunity.com/profiles/${esc(d.account.verified_steam_id)}" target="_blank" rel="noopener" style="color:var(--accent)">View</a></div></div>`;
    box.innerHTML=`<div class="panel" style="max-width:760px">
      <div class="eyebrow">LAST STEP</div>
      <h2 style="margin-top:8px">Set up your player profile</h2>
      <p class="muted" style="margin-top:0">This is what teams see when they look for players. CleanLobby never asks for your Steam password.</p>
      <form data-form="profile" class="form-grid" style="margin-top:18px">
        ${steamField}
        <div><label>Display name</label><input class="input" name="display_name" maxlength="40" value="${esc(d.account.username)}" required></div>
        <div><label>Country</label><select name="country" required>${cat.countries.filter(c=>c.open).map(c=>`<option value="${c.code}" ${c.code==='MA'?'selected':''}>${c.flag} ${esc(countryName(c.code))}</option>`).join('')}</select>
          <div class="muted small" style="margin-top:5px">The beta is open in these countries only. <a href="/guide#beta-countries" style="color:var(--accent)">More countries later</a>.</div></div>
        <div><label>CS2 Premier rating</label><div class="input" style="color:var(--muted)">Read from Leetify automatically</div>
          <div class="muted small" style="margin-top:5px">We copy it from your <a href="https://leetify.com/" target="_blank" rel="noopener" style="color:var(--accent)">Leetify</a> profile, so nobody can fake it. No Leetify yet? Sign in there once with Steam.</div></div>
        <div><label>Main role</label><select name="role">${ROLES.map(r=>`<option>${r}</option>`).join('')}</select></div>
        <div class="full"><label>Languages you speak (teammates need one in common)</label>${languageBoxes(['FR'])}</div>
        <div class="full"><label>Avatar URL (optional, https)</label><input class="input" name="avatar_url" type="url" placeholder="https://..."></div>
        <div class="full"><button class="btn btn-green">Save profile</button></div>
      </form>
    </div>`;
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
    'premier-leetify': ()=>post('/api/profile/premier',{}),
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
    'vote': async (id,arg)=>{
      const [to,aspect,vote]=String(arg).split(':');
      await post(`/api/matches/${id}/votes`,{to_player_id:Number(to),aspect,vote:Number(vote)});
      return {};   // re-render to show the vote
    },
    'votes-all-up': id=>post(`/api/matches/${id}/votes/all-up`,{})
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
      const checked=()=>[...form.querySelectorAll('input[name="languages"]:checked')].map(x=>x.value);
      if(form.dataset.form==='languages'){ const r=await post('/api/profile/languages',{languages:checked()}); toast(r.message); }
      if(form.dataset.form==='create-team'){ await post('/api/teams',data); toast('Team created. Invite your players.'); }
      if(form.dataset.form==='invite'){ const r=await post(`/api/teams/${form.dataset.id}/invite`,data); toast(r.message||'Invitation sent.'); }
      if(form.dataset.form==='profile'){
        data.languages=checked();
        if(!data.avatar_url) delete data.avatar_url;
        await post('/api/profile',data); toast('Profile saved. Welcome to CleanLobby!');
      }
      await renderPlay();
    }catch(err){ toast(err.message,true); if(button) button.disabled=false; }
  }


  // ---------- Account page (self-service deletion) ----------
  async function account(){
    layout('Account',`<div class="container" style="max-width:720px"><div class="eyebrow">ACCOUNT</div><h1>Your account</h1><div id="account"><div class="empty">Loading...</div></div></div>`);
    const box=document.getElementById('account');
    const r=await fetch('/api/me',{credentials:'include'});
    if(!r.ok){ box.innerHTML=`<div class="panel"><p class="muted" style="margin:0">Please <a href="/login" style="color:var(--accent)">sign in</a> first.</p></div>`; return; }
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
        <div class="row"><span class="muted">Player profile</span>${me.player?`<a href="/player/${encodeURIComponent(me.player.display_name)}" style="color:var(--accent)">${esc(me.player.display_name)}</a>`:'<span class="muted">Not set up</span>'}</div>
        <p class="muted small" style="margin-bottom:0">Want to change something or get a copy of your data? Email <a href="mailto:contact@cleanlobby.com" style="color:var(--accent)">contact@cleanlobby.com</a>. See our <a href="/privacy" style="color:var(--accent)">Privacy Policy</a> and <a href="/terms" style="color:var(--accent)">Terms</a>.</p>
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
      if(!confirm('Delete your CleanLobby account permanently?')) return;
      const b=form.querySelector('button'); b.disabled=true;
      try{
        await post('/api/account/delete',Object.fromEntries(new FormData(form)));
        box.innerHTML=`<div class="panel"><h2>Your account has been deleted.</h2><p class="muted">Thanks for trying CleanLobby.</p><a class="btn btn-dark" href="/">Back to home</a></div>`;
        window.Stack5CurrentAccount=null;
      }catch(err){ toast(err.message,true); b.disabled=false; }
    };
  }

  // ---------- Marketplace buttons ----------
  async function requestJoin(teamId, b){
    if(!window.Stack5CurrentAccount){ go('/login'); return; }
    b.disabled=true;
    try{ const r=await post(`/api/teams/${teamId}/request-join`); toast(r.message); b.textContent='Requested'; }
    catch(err){ toast(err.message,true); b.disabled=false; }
  }

  async function invitePlayer(playerId, b){
    if(!window.Stack5CurrentAccount){ go('/login'); return; }
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
    const p=appPath().replace(/\/$/,'')||'/';
    if(p==='/') return home();
    if(p==='/teams') return teams();
    if(p==='/players') return players();
    if(p.startsWith('/player/')) return playerProfile(decodeURIComponent(p.split('/')[2]));
    if(p==='/play') return play();
    if(p==='/account') return account();
    if(p==='/matches') return matchesPage();
    if(p==='/contact') return contactPage();
    if(p==='/guide') return guidePage();
    if(p==='/test') return testPage();
    if(p==='/rankings') return layout('Rankings',`<div class="container"><div class="eyebrow">RANKINGS</div><h1>Rankings</h1><div class="empty">Rankings coming next.</div></div>`,'rankings');
    if(p.startsWith('/team/')) return teamProfile(p.split('/')[2]);
    return home();
  }

  async function teamProfile(id){
    const t=await get('/api/teams/'+id);
    layout(t.name,`
      <div class="container">
        <div class="eyebrow">CleanLobby TEAM</div>
        <h1 class="name-title" style="font-size:40px">${nm(t.name)}</h1>
        <p class="subtitle">${modeBadge(t)} ${t.count}/${teamSizeOf(t)} players · ${premierRange(t.min_rating,t.max_rating)}</p>
        <div class="section">
          <h2>Roster</h2>
          <div class="grid">${(t.members||[]).map(p=>`
            <a class="card" href="/player/${encodeURIComponent(p.display_name)}">
              <h3>${nm(p.display_name)}</h3>
              <div class="meta"><span>${premier(p.premier_rating)}</span><span>${esc(p.role||'—')}</span></div>
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
    go('/');
  }

  return {
    t,
    route,
    logout,
    requestJoin,
    invitePlayer
  };
})();

window.Stack5T=Stack5.t;
Stack5.route();
