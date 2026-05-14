
/* ══ SUPABASE AUTH ══ */
// Charge le SDK Supabase de manière asynchrone
let supabase = null;
const SUPABASE_URL = 'https://nwxmnknsoadcjrocluwe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6wU11x2f2dmRmlFK5WM-aA_IWXENyJz';

let _supabasePromise=null;
async function initSupabase(){
  if(supabase)return supabase;
  if(_supabasePromise)return _supabasePromise;
  _supabasePromise=(async()=>{
    try{
      const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
      return supabase;
    }catch(e){console.error('Supabase non disponible:',e);return null;}
  })();
  return _supabasePromise;
}

let currentUser=null;
let authMode='signup'; // 'signup' | 'login'

function switchAuthTab(mode){
  authMode=mode;
  // Réécriture explicite sans toggle pour éviter les bugs
  const tabs=document.querySelectorAll('.auth-tab');
  if(tabs.length>=2){
    if(mode==='signup'){
      tabs[0].classList.add('active');
      tabs[1].classList.remove('active');
    } else {
      tabs[0].classList.remove('active');
      tabs[1].classList.add('active');
    }
  }
  const title=document.getElementById('auth-title');
  const btn=document.getElementById('auth-submit-btn');
  const err=document.getElementById('auth-error');
  if(title)title.textContent=mode==='signup'?'Créer un compte':'Se connecter';
  if(btn)btn.textContent=mode==='signup'?'Créer mon compte':'Se connecter';
  if(err){err.style.display='none';err.style.background='';err.style.color='';}
}

async function submitAuth(){
  const sb=await initSupabase();
  const email=document.getElementById('auth-email').value.trim();
  const password=document.getElementById('auth-password').value;
  const errEl=document.getElementById('auth-error');
  errEl.style.display='none';

  if(!email||!password){errEl.textContent='Email et mot de passe requis.';errEl.style.display='block';return;}
  if(password.length<6){errEl.textContent='Le mot de passe doit faire au moins 6 caractères.';errEl.style.display='block';return;}

  const btn=document.getElementById('auth-submit-btn');
  btn.textContent='Chargement…';btn.disabled=true;

  if(!sb){
    // Mode sans Supabase — simuler un compte local
    continueAsGuest(email);btn.textContent=authMode==='signup'?'Créer mon compte':'Se connecter';btn.disabled=false;
    return;
  }

  try{
    let result;
    if(authMode==='signup'){
      result=await sb.auth.signUp({email,password});
      if(result.error)throw result.error;
      if(result.data.user&&!result.data.session){
        errEl.textContent='✅ Vérifie ta boîte mail pour confirmer ton compte !';errEl.style.display='block';
        errEl.style.background='rgba(74,222,128,.1)';errEl.style.color='#4ade80';
        btn.textContent='Créer mon compte';btn.disabled=false;return;
      }
    } else {
      result=await sb.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
    }
    if(result.data.user)onUserLoggedIn(result.data.user);
  }catch(e){
    errEl.textContent=e.message||'Erreur de connexion.';errEl.style.display='block';
    btn.textContent=authMode==='signup'?'Créer mon compte':'Se connecter';btn.disabled=false;
  }
}

function continueAsGuest(email){
  // Crée un profil local sans compte
  currentUser={id:'guest',email:email||'Invité',isGuest:true};
  localStorage.setItem('mw_guest','1');
  onUserLoggedIn(currentUser);
}

function onUserLoggedIn(user){
  setTimeout(loadVotesFromCloud, 500);
  setTimeout(loadPublicRating, 800);
  currentUser=user;
  const initials=(user.email||'?').slice(0,1).toUpperCase();
  const name=(user.email||'Invité').split('@')[0];
  document.getElementById('user-avatar').textContent=initials;
  document.getElementById('user-name-display').textContent=name;
  document.getElementById('user-badge').style.display='flex';
  loadLikesFromCloud();
  localStorage.setItem('mw_user',JSON.stringify({email:user.email,isGuest:user.isGuest||false}));
  showScreen('hero');
}

async function signOut(){
  const sb=await initSupabase();
  if(sb&&currentUser&&!currentUser.isGuest)await sb.auth.signOut();
  currentUser=null;
  localStorage.removeItem('mw_user');
  localStorage.removeItem('mw_guest');
  document.getElementById('user-badge').style.display='none';
  document.getElementById('user-menu').classList.remove('open');
  showScreen('auth-screen');
}

function toggleUserMenu(){
  document.getElementById('user-menu').classList.toggle('open');
}
document.addEventListener('click',e=>{
  if(!e.target.closest('#user-badge')&&!e.target.closest('#user-menu')){
    const m=document.getElementById('user-menu');if(m)m.classList.remove('open');
  }
});

async function checkExistingSession(){
  const sb=await initSupabase();

  // Gérer le retour après OAuth (hash dans l'URL)
  if(window.location.hash.includes('access_token')||window.location.search.includes('code=')){
    if(sb){
      const {data}=await sb.auth.getSession();
      if(data?.session?.user){onUserLoggedIn(data.session.user);return;}
    }
  }

  // Session Supabase active
  if(sb){
    const {data}=await sb.auth.getSession();
    if(data?.session?.user){onUserLoggedIn(data.session.user);return;}
  }

  // Compte invité local
  const saved=localStorage.getItem('mw_user');
  if(saved){
    try{
      const u=JSON.parse(saved);
      if(u.isGuest){continueAsGuest(u.email);return;}
    }catch(e){}
  }

  // Rien — afficher auth
  showScreen('auth-screen');
}



/* ══ OAUTH ══ */
async function signInWithGoogle(){
  const sb=await initSupabase();
  if(!sb){continueAsGuest();return;}
  const {error}=await sb.auth.signInWithOAuth({
    provider:'google',
    options:{redirectTo:window.location.origin}
  });
  if(error){
    const el=document.getElementById('auth-error');
    el.textContent='Erreur Google : '+error.message;el.style.display='block';
  }
}

async function signInWithDiscord(){
  const sb=await initSupabase();
  if(!sb){continueAsGuest();return;}
  const {error}=await sb.auth.signInWithOAuth({
    provider:'discord',
    options:{redirectTo:window.location.origin}
  });
  if(error){
    const el=document.getElementById('auth-error');
    el.textContent='Erreur Discord : '+error.message;el.style.display='block';
  }
}

/* Gérer le retour après OAuth (redirect) */
async function handleOAuthCallback(){
  const sb=await initSupabase();
  if(!sb)return;
  const {data,error}=await sb.auth.getSession();
  if(data?.session?.user){
    onUserLoggedIn(data.session.user);
  }
}



/* ══ CLOUD HISTORY (Supabase) ══ */

async function savePlaylistToCloud(songs, meta) {
  if (!currentUser || currentUser.isGuest) return;
  const sb = await initSupabase();
  if (!sb) return;
  try {
    await sb.from('playlists').insert({
      user_id: currentUser.id,
      meta: meta,
      songs: songs
    });
  } catch(e) {
    console.error('Erreur sauvegarde cloud:', e);
  }
}

async function loadPlaylistsFromCloud() {
  if (!currentUser || currentUser.isGuest) return null;
  const sb = await initSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('playlists')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  } catch(e) {
    console.error('Erreur chargement cloud:', e);
    return null;
  }
}

async function deletePlaylistFromCloud(id) {
  if (!currentUser || currentUser.isGuest) return;
  const sb = await initSupabase();
  if (!sb) return;
  try {
    await sb.from('playlists').delete().eq('id', id);
  } catch(e) {
    console.error('Erreur suppression cloud:', e);
  }
}



/* ══ HISTORIQUE TITRES AIMÉS ══ */
function getAllLikedSongs(){
  const v=loadVotes();
  const history=getHistory();
  const liked=[];
  const seen=new Set();
  history.forEach(entry=>{
    (entry.songs||[]).forEach(s=>{
      const key=voteKey(s);
      if(v[key]==='like'&&!seen.has(key)){
        seen.add(key);
        liked.push({...s,key});
      }
    });
  });
  // Aussi depuis window._historyEntries (cloud)
  (window._historyEntries||[]).forEach(entry=>{
    (entry.songs||[]).forEach(s=>{
      const key=voteKey(s);
      if(v[key]==='like'&&!seen.has(key)){
        seen.add(key);
        liked.push({...s,key});
      }
    });
  });
  return liked;
}

async function renderLikedSongs(){
  const list=document.getElementById('liked-list');
  const countEl=document.getElementById('liked-count');
  list.innerHTML='<div class="weekly-loading">Chargement…</div>';

  // Charger depuis le cloud si connecté
  let liked=[];
  const cloudLikes=await getLikedSongsFromCloud();
  if(cloudLikes&&cloudLikes.length>0){
    liked=cloudLikes.map(row=>({artist:row.artist,title:row.title,genre:row.genre,key:row.song_key}));
  } else {
    liked=getAllLikedSongs();
  }

  if(countEl)countEl.textContent=liked.length+' titre'+(liked.length>1?'s':'')+' aimé'+(liked.length>1?'s':'');
  if(!liked.length){
    list.innerHTML=`<div class="liked-empty"><div class="icon">💔</div><p>Aucun titre aimé pour l'instant.<br>Utilise 👍 sur tes playlists !</p></div>`;
    return;
  }
  list.innerHTML=liked.map((s,i)=>{
    return '<div class="liked-song-card">'+
      '<span class="liked-song-num">'+String(i+1).padStart(2,'0')+'</span>'+
      '<button class="liked-play-btn" data-artist="'+esc(s.artist)+'" data-title="'+esc(s.title)+'" onclick="playPreview(this.dataset.artist,this.dataset.title,this)">▶</button>'+
      '<div class="liked-song-info">'+
        '<div class="liked-song-artist">'+esc(s.artist)+'</div>'+
        '<div class="liked-song-title">'+esc(s.title)+'</div>'+
        '<div class="liked-song-genre">'+esc(s.genre||'')+'</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

async function generateFromLiked(){
  const liked=getAllLikedSongs();
  if(!liked.length){showScreen('form-screen');return;}
  showScreen('loading-screen');startLoading();
  const likedLabels=liked.map(s=>s.artist+' — '+s.title);
  const meta='Playlist depuis mes ❤️';
  try{
    const res=await fetch('/api/playlist',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'mood',mood:'Varié',energy:'Moyen',context:'Détente',genres:[],likedSongs:likedLabels,dislikedSongs:[]})});
    if(!res.ok)throw new Error('Erreur');
    const songs=await res.json();
    stopLoading();currentSongs=songs;currentMeta=meta;
    saveToHistory(songs,meta);
    const moodForStat=sel.mood||'';
    if(moodForStat)trackMoodStat(moodForStat);
    renderResults(songs,meta);
  }catch(e){stopLoading();showScreen('liked-screen');}
}

/* ══ CLASSEMENT DES MOODS ══ */
// Stats locales (agrégées depuis l'historique)
function getMoodStats(){
  const history=[...getHistory(),...(window._historyEntries||[])];
  const stats={};
  history.forEach(e=>{
    if(!e.meta||e.meta==='Mode Surprise')return;
    // Extraire le mood du meta "Genres / Mood / Energie / Contexte"
    const parts=e.meta.split(' / ');
    // Le mood est généralement la 2e partie (après les genres)
    for(const part of parts){
      const moods=['Calme','Stressé','Heureux','Triste','Motivé','Excité','Nostalgique','Focus TDAH','Anxieux'];
      const found=moods.find(m=>part.includes(m));
      if(found){stats[found]=(stats[found]||0)+1;break;}
    }
  });
  return stats;
}

async function getGlobalMoodStats(){
  // Essayer de charger depuis Supabase
  const sb=await initSupabase();
  if(!sb||!currentUser||currentUser.isGuest)return null;
  try{
    const {data}=await sb.from('mood_stats').select('mood,count').order('count',{ascending:false}).limit(10);
    return data;
  }catch(e){return null;}
}

async function trackMoodStat(mood){
  const sb=await initSupabase();
  if(!sb||!mood||mood==='Mode Surprise')return;
  try{
    // Upsert — incrémente le compteur
    await sb.rpc('increment_mood_stat',{mood_name:mood});
  }catch(e){
    // Silencieux si la table n'existe pas encore
  }
}

async function renderRanking(){
  const list=document.getElementById('ranking-list');
  const personal=document.getElementById('ranking-personal');
  list.innerHTML='<div class="weekly-loading">Chargement…</div>';

  // Stats globales depuis Supabase
  // Charger stats globales Supabase
  const global=await getGlobalMoodStats();

  // Stats locales comme fallback et pour section perso
  const localStats=getMoodStats();
  const localArr=Object.entries(localStats).sort((a,b)=>b[1]-a[1]);

  // Si pas de données globales, afficher message d'encouragement


  const moodEmojis={
    'Calme':'🌙','Stressé':'⚠️','Heureux':'😊','Triste':'🌧️',
    'Motivé':'🚀','Excité':'⚡','Nostalgique':'🕰️','Focus TDAH':'🎯','Anxieux':'💓'
  };

  if(global&&global.length>0){
    const max=global[0].count||1;
    list.innerHTML='<p style="font-size:.75rem;color:var(--muted);margin-bottom:1rem">Données de la communauté Moodwave</p>'+
      global.map((item,i)=>{
        const pct=Math.round((item.count/max)*100);
        const pos=i===0?'gold':i===1?'silver':i===2?'bronze':'';
        return '<div class="mood-rank-item">'+
          '<div class="mood-rank-pos '+pos+'">'+(i+1)+'</div>'+
          '<div class="mood-rank-info">'+
            '<div class="mood-rank-name">'+(moodEmojis[item.mood]||'🎵')+' '+item.mood+'</div>'+
            '<div class="mood-rank-count">'+item.count+' playlist'+(item.count>1?'s':'')+'</div>'+
          '</div>'+
          '<div class="mood-rank-bar-wrap"><div class="mood-rank-bar"><div class="mood-rank-fill" style="width:'+pct+'%"></div></div></div>'+
        '</div>';
      }).join('');
  } else if(localArr.length>0){
    const max=localArr[0][1]||1;
    list.innerHTML='<p style="font-size:.75rem;color:var(--muted);margin-bottom:1rem">Tes statistiques personnelles</p>'+
      localArr.map(([mood,count],i)=>{
        const pct=Math.round((count/max)*100);
        const pos=i===0?'gold':i===1?'silver':i===2?'bronze':'';
        return '<div class="mood-rank-item">'+
          '<div class="mood-rank-pos '+pos+'">'+(i+1)+'</div>'+
          '<div class="mood-rank-info">'+
            '<div class="mood-rank-name">'+(moodEmojis[mood]||'🎵')+' '+mood+'</div>'+
            '<div class="mood-rank-count">'+count+' playlist'+(count>1?'s':'')+'</div>'+
          '</div>'+
          '<div class="mood-rank-bar-wrap"><div class="mood-rank-bar"><div class="mood-rank-fill" style="width:'+pct+'%"></div></div></div>'+
        '</div>';
      }).join('');
  } else {
    list.innerHTML=`<div class="liked-empty"><div class="icon">📊</div>
      <p>Le classement communauté sera disponible dès que la table Supabase est configurée.<br><br>
      <span style="font-size:.75rem;color:var(--muted)">Exécute le SQL de configuration dans Supabase pour activer cette fonctionnalité.</span></p></div>`;
  }

  // Stats perso en bas
  if(localArr.length>0&&global){
    personal.innerHTML='<p style="font-size:.75rem;color:var(--muted);margin-top:1.5rem;margin-bottom:.75rem">TES STATS PERSO</p>'+
      localArr.slice(0,3).map(([mood,count])=>
        '<div class="mood-rank-item" style="opacity:.7">'+
          '<div class="mood-rank-name" style="font-size:.85rem">'+(moodEmojis[mood]||'🎵')+' '+mood+'</div>'+
          '<div class="mood-rank-count" style="font-size:.75rem;color:var(--muted)">'+count+'x</div>'+
        '</div>'
      ).join('');
  }
}

/* ══ BADGE DE PARTAGE ══ */
function showShareBadge(meta){
  const emojis={'Calme':'🌙','Motivé':'🚀','Heureux':'☀️','Triste':'🌧️','Excité':'⚡'};
  const mood=meta?meta.split(' / ')[0]:'';
  const emoji=emojis[mood]||'🎵';
  document.getElementById('badge-emoji').textContent=emoji;
  document.getElementById('badge-title').textContent='Tu vas adorer cette playlist !';
  document.getElementById('badge-sub').textContent=
    "Quelqu'un a partagé une playlist Moodwave avec toi — mood : \""+mood+"\". Crée la tienne gratuitement en 30 secondes.";
  document.getElementById('share-badge-overlay').classList.add('open');
}
function closeShareBadge(){
  document.getElementById('share-badge-overlay').classList.remove('open');
}



/* ══ LIKES CLOUD ══ */
async function saveVotesToCloud(){
  if(!currentUser||currentUser.isGuest)return;
  const sb=await initSupabase();if(!sb)return;
  try{
    await sb.from('user_likes').upsert({
      user_id:currentUser.id,
      votes:votes,
      updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
  }catch(e){}
}

async function loadVotesFromCloud(){
  if(!currentUser||currentUser.isGuest)return;
  const sb=await initSupabase();if(!sb)return;
  try{
    const {data}=await sb.from('user_likes').select('votes').eq('user_id',currentUser.id).single();
    if(data&&data.votes){
      votes={...loadVotes(),...data.votes};
      saveVotes();
    }
  }catch(e){}
}

async function syncLikeToCloud(key, voteType){
  const sb=await initSupabase();
  if(!sb||!currentUser||currentUser.isGuest)return;
  try{
    if(!voteType){
      await sb.from('liked_songs').delete().eq('user_id',currentUser.id).eq('song_key',key);
    } else if(voteType==='like'){
      // Trouver les infos du titre depuis l'historique
      const song=findSongByKey(key);
      await sb.from('liked_songs').upsert({
        user_id:currentUser.id,
        song_key:key,
        artist:song?.artist||'',
        title:song?.title||'',
        genre:song?.genre||'',
        created_at:new Date().toISOString()
      },{onConflict:'user_id,song_key'});
    } else {
      await sb.from('liked_songs').delete().eq('user_id',currentUser.id).eq('song_key',key);
    }
  }catch(e){console.log('Sync like silencieux:',e.message);}
}

function findSongByKey(key){
  const history=[...getHistory(),...(window._historyEntries||[])];
  for(const entry of history){
    for(const s of (entry.songs||[])){
      if(voteKey(s)===key)return s;
    }
  }
  return null;
}

async function loadLikesFromCloud(){
  const sb=await initSupabase();
  if(!sb||!currentUser||currentUser.isGuest)return;
  try{
    const {data}=await sb.from('liked_songs').select('song_key').eq('user_id',currentUser.id);
    if(data&&data.length>0){
      data.forEach(row=>{if(!votes[row.song_key])votes[row.song_key]='like';});
      saveVotes();
    }
  }catch(e){}
}

async function getLikedSongsFromCloud(){
  const sb=await initSupabase();
  if(!sb||!currentUser||currentUser.isGuest)return null;
  try{
    const {data}=await sb.from('liked_songs')
      .select('*').eq('user_id',currentUser.id)
      .order('created_at',{ascending:false});
    return data;
  }catch(e){return null;}
}



/* ══ FEEDBACK & NOTATION ══ */
let currentRating = 0;
let currentCat = '';

const ratingLabels = {
  1: 'Très décevant 😞',
  2: 'Peut mieux faire 😐',
  3: 'Correct 🙂',
  4: 'Très bien ! 😊',
  5: `Excellent, j'adore ! 🤩`
};

function setRating(val){
  currentRating = val;
  document.querySelectorAll('.star-btn').forEach(b=>{
    b.classList.toggle('active', parseInt(b.dataset.val) <= val);
  });
  const lbl = document.getElementById('rating-label');
  if(lbl) lbl.textContent = ratingLabels[val] || '';
}

function selectCat(el){
  document.querySelectorAll('.feedback-cat').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  currentCat = el.dataset.val;
}


async function checkAlreadyVoted(){
  // Bloquer les invités
  const guestBlock = document.getElementById('feedback-guest-block');
  const formWrap = document.getElementById('feedback-form-wrap');
  if(!currentUser || currentUser.isGuest){
    if(guestBlock) guestBlock.style.display = 'block';
    if(formWrap) formWrap.style.display = 'none';
    return;
  }
  // Utilisateur connecté — afficher le formulaire
  if(guestBlock) guestBlock.style.display = 'none';
  if(formWrap) formWrap.style.display = 'block';
  const sb = await initSupabase();
  if(!sb) return;
  try{
    const {data} = await sb
      .from('feedbacks')
      .select('id, rating, category, comment')
      .eq('user_id', currentUser.id)
      .limit(1);
    if(data && data.length > 0){
      const existing = data[0];
      const 