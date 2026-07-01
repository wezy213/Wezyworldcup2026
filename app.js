const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let session=null, teams=[], matches=[], predictions=[], results=[], profiles=[];
const $=id=>document.getElementById(id);
const team=c=>teams.find(t=>t.code===c)||{name:c||"",flag:""};
const label=(c,p)=>c?`${team(c).flag} ${team(c).name}`:(p||"لم يتحدد");
const isGroup=m=>m.round==="دور المجموعات";
const isKnockout=m=>!isGroup(m);
const hasResult=m=>results.some(r=>String(r.match_id)===String(m.id));
const locked=m=>{
  if(!m)return true;
  const resultExists=hasResult(m);
  const lockTime=new Date(new Date(m.kickoff_at).getTime()-5*60*1000);
  return resultExists || new Date()>=lockTime || m.is_locked;
};
async function init(){
  session=(await db.auth.getSession()).data.session;
  db.auth.onAuthStateChange((_e,s)=>{session=s;loadAll();});
  await loadAll();
}
async function loadAll(){
  const [t,m,p,r,pr]=await Promise.all([
    db.from("teams").select("*").order("group_name").order("group_pos"),
    db.from("matches").select("*").order("match_no"),
    db.from("predictions_v2").select("*"),
    db.from("match_results").select("*"),
    db.from("profiles").select("*")
  ]);
  if(t.error){ console.error(t.error); alert("تعذر الاتصال بقاعدة البيانات. تأكد من config.js ومفاتيح Supabase."); return; }
  teams=t.data||[]; matches=m.data||[]; predictions=p.data||[]; results=r.data||[]; profiles=pr.data||[];
  renderAll();
}
function renderAll(){
  $("statPlayers").textContent=profiles.length;
  $("statPreds").textContent=predictions.length;
  $("statMatches").textContent=matches.length;
  renderMe(); renderChampion(); renderTeams(); renderRounds(); renderMatches(); renderBracket(); renderLeaderboard(); renderMyResults(); renderAccuracy(); renderQuickSummary(); renderAdmin();
}
function renderMe(){
  const prof=session&&profiles.find(p=>p.id===session.user.id);
  $("me").textContent=prof?`داخل باسم: ${prof.username}`:"غير مسجل دخول";
}
function renderChampion(){
  $("champion").innerHTML=teams.map(t=>`<option value="${t.code}">${t.flag} ${t.name}</option>`).join("");
}
async function signUp(){
  const email=$("email").value.trim(), password=$("password").value, username=$("username").value.trim(), champion_code=$("champion").value;
  if(!email||!password||!username)return alert("أكمل الإيميل وكلمة المرور والاسم");
  if(password.length<6)return alert("كلمة المرور يجب أن تكون 6 أحرف أو أكثر");
  if(profiles.some(p=>p.username.toLowerCase()===username.toLowerCase()))return alert("الاسم مستخدم، اختر اسم آخر");
  const {data,error}=await db.auth.signUp({email,password});
  if(error)return alert(error.message);
  if(data.user){
    const ins=await db.from("profiles").insert({id:data.user.id,username,champion_code});
    if(ins.error)return alert(ins.error.message);
  }
  alert("تم إنشاء الحساب"); await loadAll();
}
async function signIn(){
  const {error}=await db.auth.signInWithPassword({email:$("email").value.trim(), password:$("password").value});
  if(error)return alert(error.message);
  await loadAll();
}
async function signOut(){ await db.auth.signOut(); await loadAll(); }
function renderTeams(){
  const gs=[...new Set(teams.map(t=>t.group_name))].sort();
  $("groups").className="groups";
  $("groups").innerHTML=gs.map(g=>`<div class="group"><h3>المجموعة ${g}</h3>${teams.filter(t=>t.group_name===g).map(t=>`<div class="team"><span class="flag">${t.flag}</span><span>${t.name}</span></div>`).join("")}</div>`).join("");
}
function renderRounds(){
  const el=$("roundFilter");
  const current=el.value||"knockout-open";
  el.innerHTML=`
    <option value="knockout-open">الأدوار الإقصائية المفتوحة</option>
    <option value="knockout">كل الأدوار الإقصائية</option>
    <option value="groups-open">مباريات المجموعات القادمة</option>
    <option value="finished-groups">مباريات المجموعات المنتهية</option>
    <option value="groups">كل مباريات المجموعات</option>
    <option value="all">كل المباريات</option>`;
  el.value=[...el.options].some(o=>o.value===current)?current:"knockout-open";
}
function setFilter(v){ $("roundFilter").value=v; renderMatches(); }
function fmtDate(d){ return new Date(d).toLocaleString("ar-SA",{calendar:"gregory",dateStyle:"medium",timeStyle:"short"}); }
function timeUntilLock(m){
  const lock=new Date(new Date(m.kickoff_at).getTime()-5*60*1000);
  const diff=lock-new Date();
  if(diff<=0)return "الآن";
  const h=Math.floor(diff/3600000), min=Math.floor((diff%3600000)/60000);
  return `${h}س ${min}د`;
}
function renderMatches(){
  const f=$("roundFilter").value||"knockout-open";
  let list=matches.filter(m=>{
    const done=hasResult(m);
    if(f==="knockout-open") return isKnockout(m)&&!locked(m);
    if(f==="knockout") return isKnockout(m);
    if(f==="groups-open") return isGroup(m)&&!done;
    if(f==="finished-groups") return isGroup(m)&&done;
    if(f==="groups") return isGroup(m);
    return true;
  });
  if(!list.length){$("matchesList").innerHTML=`<p class="muted center-text">لا توجد مباريات في هذا القسم حالياً.</p>`;return;}
  $("matchesList").innerHTML=list.map(m=>{
    const r=results.find(x=>String(x.match_id)===String(m.id));
    const p=session&&predictions.find(x=>String(x.match_id)===String(m.id)&&x.user_id===session.user.id);
    const l=locked(m);
    const homeLabel=label(m.home_code,m.home_placeholder), awayLabel=label(m.away_code,m.away_placeholder);
    const homeName=team(m.home_code).name||m.home_placeholder||"الفريق الأول";
    const awayName=team(m.away_code).name||m.away_placeholder||"الفريق الثاني";
    const qVisible=p && Number(p.home_goals)===Number(p.away_goals) && isKnockout(m);
    return `<div class="match ${l?'locked':''}">
      <div class="match-top"><b>مباراة ${m.match_no} - ${m.round}${m.group_name?' - مجموعة '+m.group_name:''}</b><span>${fmtDate(m.kickoff_at)}</span></div>
      <div class="match-body">
        <div class="team-predict home-side">
          <div class="team-name">${homeLabel}</div>
          <label class="goal-label" for="h_${m.id}">توقع أهداف ${homeName}</label>
          <input id="h_${m.id}" type="number" min="0" inputmode="numeric" placeholder="0" value="${p?.home_goals??''}" ${l?'disabled':''} oninput="toggleQualifier('${m.id}')">
        </div>
        <div class="match-center">
          <div class="score">${r?.home_goals??'-'} : ${r?.away_goals??'-'}</div>
          <button onclick="savePrediction('${m.id}')" ${l?'disabled':''}>حفظ التوقع</button>
        </div>
        <div class="team-predict away-side">
          <div class="team-name">${awayLabel}</div>
          <label class="goal-label" for="a_${m.id}">توقع أهداف ${awayName}</label>
          <input id="a_${m.id}" type="number" min="0" inputmode="numeric" placeholder="0" value="${p?.away_goals??''}" ${l?'disabled':''} oninput="toggleQualifier('${m.id}')">
        </div>
      </div>
      <div id="qbox_${m.id}" class="qualifier-box ${qVisible?'':'hidden'}">
        <b>اختر المتأهل في حال التعادل (+3):</b>
        <div class="qualifier-options">
          <label><input type="radio" name="q_${m.id}" value="${m.home_code||''}" ${p?.winner_code===m.home_code?'checked':''} ${l?'disabled':''}> ${homeLabel}</label>
          <label><input type="radio" name="q_${m.id}" value="${m.away_code||''}" ${p?.winner_code===m.away_code?'checked':''} ${l?'disabled':''}> ${awayLabel}</label>
        </div>
      </div>
      <div class="small match-note ${r?'computed':''}">${r?'🟢 تم احتساب النقاط':(l?'🔒 التوقع مغلق':'⏳ التوقع مفتوح')} ${!r&&!l?`— يغلق بعد ${timeUntilLock(m)}`:''} ${p?`— توقعك: ${p.home_goals}-${p.away_goals} | نقاط: ${pointsForPrediction(p)}`:''}</div>
    </div>`;
  }).join("");
}
function toggleQualifier(id){
  const m=matches.find(x=>String(x.id)===String(id));
  const box=$("qbox_"+id); if(!m||!box)return;
  const h=$("h_"+id).value, a=$("a_"+id).value;
  const show=isKnockout(m) && h!=="" && a!=="" && Number(h)===Number(a);
  box.classList.toggle("hidden",!show);
}
async function savePrediction(id){
  if(!session)return alert("سجل دخول أولاً");
  const m=matches.find(x=>String(x.id)===String(id));
  if(locked(m))return alert("التوقع مغلق لهذه المباراة");
  const h=Number($("h_"+id).value), a=Number($("a_"+id).value);
  if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0)return alert("اكتب نتيجة صحيحة");
  let winner_code=h>a?m.home_code:a>h?m.away_code:"DRAW";
  if(isKnockout(m)&&h===a){
    const checked=document.querySelector(`input[name="q_${id}"]:checked`);
    if(!checked)return alert("اختر المتأهل في حال التعادل");
    winner_code=checked.value;
  }
  const payload={user_id:session.user.id, match_id:id, home_goals:h, away_goals:a, winner_code};
  const {error}=await db.from("predictions_v2").upsert(payload,{onConflict:"user_id,match_id"});
  if(error)return alert(error.message);
  alert("تم حفظ التوقع"); await loadAll();
} 
function normalizeWinnerCode(code,m,r){
  if(!code)return null;
  if(code==="HOME")return m?.home_code;
  if(code==="AWAY")return m?.away_code;
  if(code==="DRAW")return "DRAW";
  return code;
}

function calcPoints(p,r){
  if(!r)return 0;

  const m=matches.find(x=>String(x.id)===String(p.match_id));
  const ph=Number(p.home_goals), pa=Number(p.away_goals);
  const rh=Number(r.home_goals), ra=Number(r.away_goals);

  if(!Number.isFinite(ph)||!Number.isFinite(pa)||!Number.isFinite(rh)||!Number.isFinite(ra))return 0;

  const predDraw=ph===pa;
  const realDraw=rh===ra;
  const exact=ph===rh && pa===ra;

  let pts=0;

  if(exact) pts += 7;
  else if(predDraw && realDraw) pts += 1;
  else if(!predDraw && !realDraw && ((ph>pa&&rh>ra)||(pa>ph&&ra>rh))) pts += 2;

  if(isKnockout(m)&&predDraw&&realDraw){
    const predictedQualifier=normalizeWinnerCode(p.winner_code,m,r);
    const actualQualifier=normalizeWinnerCode(r.winner_code,m,r);
    if(predictedQualifier && actualQualifier && predictedQualifier!=="DRAW" && predictedQualifier===actualQualifier){
      pts += 3;
    }
  }

  return pts;
}

function pointsForPrediction(p){
  const r=results.find(x=>String(x.match_id)===String(p.match_id));
  return calcPoints(p,r);
}

function renderBracket(){
  const kos=matches.filter(isKnockout);
  $("bracketList").className="bracket-grid";
  $("bracketList").innerHTML=kos.map(m=>`<div class="bracket-card"><b>${m.round} - مباراة ${m.match_no}</b><br>${label(m.home_code,m.home_placeholder)} × ${label(m.away_code,m.away_placeholder)}<br><span class="small">${fmtDate(m.kickoff_at)}</span></div>`).join("");
}
function getLeaderboardRows(){
  return profiles.map(p=>{ const ps=predictions.filter(x=>x.user_id===p.id); return {...p,pts:ps.reduce((s,x)=>s+pointsForPrediction(x),0),count:ps.length}; })
    .sort((a,b)=>b.pts-a.pts || b.count-a.count || String(a.username).localeCompare(String(b.username),'ar'));
}
function renderLeaderboard(){
  const rows=getLeaderboardRows(); let prev={}; try{prev=JSON.parse(localStorage.getItem('wezyRanks')||'{}')}catch(e){}
  const medals=["🥇","🥈","🥉"];
  $("leaderboardBody").innerHTML=rows.map((p,i)=>{ const old=prev[p.id], move=old?old-(i+1):0; const moveTxt=move>0?` <span class="move up">⬆️ ${move}</span>`:move<0?` <span class="move down">⬇️ ${Math.abs(move)}</span>`:""; return `<tr class="${i<3?`top top-${i+1}`:""}"><td class="player-name">${medals[i]||""} ${p.username}${moveTxt}</td><td class="champion-pick">${team(p.champion_code).flag} ${team(p.champion_code).name||"-"}</td><td class="points-cell"><b>${p.pts}</b></td></tr>`; }).join("");
  const now={}; rows.forEach((p,i)=>now[p.id]=i+1); localStorage.setItem('wezyRanks',JSON.stringify(now));
}
function renderQuickSummary(){
  const el=$("quickSummary"); if(!el)return; const rows=getLeaderboardRows(); const prof=session&&profiles.find(p=>p.id===session.user.id); const leader=rows[0];
  if(!prof){el.innerHTML=`<div><b>سجل دخولك</b><span>لتظهر نقاطك</span></div><div><b>المتصدر</b><span>${leader?leader.username+' — '+leader.pts:'-'}</span></div><div><b>الإقصائية المفتوحة</b><span>${matches.filter(m=>isKnockout(m)&&!locked(m)).length}</span></div>`;return;}
  const me=rows.find(p=>p.id===prof.id); const resultedIds=new Set(results.map(r=>String(r.match_id))); const myPreds=predictions.filter(p=>p.user_id===prof.id); const scored=myPreds.filter(p=>resultedIds.has(String(p.match_id))&&pointsForPrediction(p)>0).length; const done=myPreds.filter(p=>resultedIds.has(String(p.match_id))).length;
  el.innerHTML=`<div><b>مركزك</b><span>#${rows.findIndex(p=>p.id===prof.id)+1}</span></div><div><b>نقاطك</b><span>${me?.pts||0}</span></div><div><b>توقعات صحيحة</b><span>${scored} من ${done}</span></div><div><b>المتصدر</b><span>${leader?leader.username+' — '+leader.pts:'-'}</span></div><div><b>بطلك</b><span>${team(prof.champion_code).flag} ${team(prof.champion_code).name||'-'}</span></div>`;
}
function renderMyResults(){
  const el=$("myResults"); if(!el)return;
  if(!session){el.innerHTML=`<p class="muted">سجل دخولك حتى تشوف توقعاتك ونقاط كل مباراة.</p>`;return;}
  const mine=predictions.filter(p=>p.user_id===session.user.id).sort((a,b)=>(matches.find(m=>m.id===a.match_id)?.match_no||0)-(matches.find(m=>m.id===b.match_id)?.match_no||0));
  if(!mine.length){el.innerHTML=`<p class="muted">ما عندك توقعات محفوظة حتى الآن.</p>`;return;}
  el.innerHTML=mine.map(p=>{ const m=matches.find(x=>String(x.id)===String(p.match_id)); const r=results.find(x=>String(x.match_id)===String(p.match_id)); const pts=pointsForPrediction(p); let extra=""; if(m&&isKnockout(m)&&Number(p.home_goals)===Number(p.away_goals)&&p.winner_code&&p.winner_code!=="DRAW") extra=` — المتأهل: ${label(p.winner_code)}`; return `<div class="result-card ${r?'done':''}"><b>مباراة ${m?.match_no||''}: ${label(m?.home_code,m?.home_placeholder)} × ${label(m?.away_code,m?.away_placeholder)}</b><span>توقعك: ${p.home_goals}-${p.away_goals}${extra}</span><span>النتيجة: ${r?`${r.home_goals}-${r.away_goals}`:'لم تُدخل بعد'}</span><strong>+${pts} نقاط</strong></div>`; }).join('');
}
function renderAccuracy(){
  const el=$("accuracyList"); if(!el)return; const resultIds=new Set(results.map(r=>String(r.match_id)));
  const rows=profiles.map(prof=>{ const ps=predictions.filter(p=>p.user_id===prof.id&&resultIds.has(String(p.match_id))); const hits=ps.filter(p=>pointsForPrediction(p)>0).length; const exact=ps.filter(p=>{const r=results.find(x=>String(x.match_id)===String(p.match_id)); return r&&Number(p.home_goals)===Number(r.home_goals)&&Number(p.away_goals)===Number(r.away_goals);}).length; return {...prof,total:ps.length,hits,exact,pct:ps.length?Math.round(hits/ps.length*100):0}; }).filter(x=>x.total>0).sort((a,b)=>b.pct-a.pct||b.exact-a.exact||b.hits-a.hits).slice(0,10);
  if(!rows.length){el.innerHTML=`<p class="muted">تظهر الإحصائية بعد إدخال نتائج المباريات.</p>`;return;}
  el.innerHTML=`<div class="accuracy-grid">${rows.map((p,i)=>`<div><b>${i+1}. ${p.username}</b><span>${p.pct}%</span><small>${p.hits} توقع صحيح من ${p.total} — نتائج صحيحة: ${p.exact}</small></div>`).join('')}</div>`;
}
function renderAdmin(){
  $("adminMatch").innerHTML=matches.map(m=>`<option value="${m.id}">مباراة ${m.match_no}: ${label(m.home_code,m.home_placeholder)} × ${label(m.away_code,m.away_placeholder)}</option>`).join("");
  renderAdminQualifier();
}
function renderAdminQualifier(){
  const id=$("adminMatch").value, m=matches.find(x=>String(x.id)===String(id)), box=$("adminQualifierBox");
  if(!m||!isKnockout(m)){box.classList.add("hidden");box.innerHTML="";return;}
  box.classList.remove("hidden");
  box.innerHTML=`<b>إذا انتهت المباراة تعادل، اختر المتأهل الفعلي:</b><div class="qualifier-options"><label><input type="radio" name="adminQ" value="${m.home_code||''}"> ${label(m.home_code,m.home_placeholder)}</label><label><input type="radio" name="adminQ" value="${m.away_code||''}"> ${label(m.away_code,m.away_placeholder)}</label></div>`;
}
async function recalcAllPointsInDatabase(){
  const {data:allPreds,error:predErr}=await db.from("predictions_v2").select("*"); const {data:allResults,error:resErr}=await db.from("match_results").select("*");
  if(predErr||resErr)return {ok:false,error:(predErr||resErr).message};
  const resultMap=new Map((allResults||[]).map(r=>[String(r.match_id),r]));
  const updates=(allPreds||[]).map(p=>db.from("predictions_v2").update({points:calcPoints(p,resultMap.get(String(p.match_id)))}).eq("id",p.id));
  await Promise.allSettled(updates); return {ok:true};
}
async function saveResultAndScore(){
  if($("adminCode").value!==WEZY_ADMIN_CODE)return alert("رمز Wezy غير صحيح");
  const match_id=$("adminMatch").value, m=matches.find(x=>String(x.id)===String(match_id));
  const home_goals=Number($("resHome").value), away_goals=Number($("resAway").value);
  if(!Number.isInteger(home_goals)||!Number.isInteger(away_goals))return alert("اكتب النتيجة");
  let winner_code=home_goals>away_goals?(m.home_code||"HOME"):home_goals<away_goals?(m.away_code||"AWAY"):"DRAW";
  if(isKnockout(m)&&home_goals===away_goals){ const checked=document.querySelector('input[name="adminQ"]:checked'); if(!checked)return alert("اختر المتأهل الفعلي عند التعادل"); winner_code=checked.value; }
  const {error}=await db.from("match_results").upsert({match_id,home_goals,away_goals,winner_code},{onConflict:"match_id"});
  if(error)return alert(error.message);
  await recalcAllPointsInDatabase(); await loadAll(); alert("تم حفظ النتيجة وتحديث الترتيب تلقائيًا");
}
setInterval(()=>loadAll(),60000);
init();
