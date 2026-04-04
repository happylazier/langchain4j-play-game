// 将原 index.html 中的脚本迁移到 app.js，保留功能并做小幅增强
const SESSIONS_KEY = 'ai_chat_sessions_v1';

function loadSessions(){ try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)||'{}'); } catch(e){ return {}; } }
function saveSessions(s){ localStorage.setItem(SESSIONS_KEY, JSON.stringify(s)); }

function createSession(name){
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9);
  const sessions = loadSessions();
  sessions[id] = { id, name: name||('会话 '+(Object.keys(sessions).length+1)), messages: [] };
  saveSessions(sessions);
  return sessions[id];
}
function deleteSession(id){ const s = loadSessions(); delete s[id]; saveSessions(s); }

// DOM refs
const sessionsEl = document.getElementById('sessions');
const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const newBtn = document.getElementById('newSession');
const sessionTitle = document.getElementById('sessionTitle');
const sessionIdDisplay = document.getElementById('sessionIdDisplay');

let currentSession = null;
let sending = false;
let controller = null;
// track current loading bubble so we can reliably remove its loading indicator
let currentLoadingBubble = null;

function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('\n','<br>'); }

function appendMessage(text, role){
  const el = document.createElement('div');
  el.className = 'msg ' + (role==='user' ? 'user' : 'bot');
  el.innerHTML = role==='user' ? `<div class="meta">你</div>${escapeHtml(text)}` : `<div class="meta">AI</div><div class="content">${escapeHtml(text)}</div>`;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

function createBotBubble(initialHtml='', loading=false){
  const el = document.createElement('div');
  el.className = 'msg bot';
  // set dataset to indicate loading state
  el.dataset.loading = loading ? 'true' : 'false';
  const loadingHtml = loading ? `<span class="small muted loading-dots"><span></span><span></span><span></span></span>` : '';
  el.innerHTML = `<div class="meta">AI ${loadingHtml}</div><div class="content">${initialHtml}</div>`;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

function renderSessionList(){
  const sessions = loadSessions();
  sessionsEl.innerHTML = '';
  const keys = Object.keys(sessions);
  if(keys.length===0){ sessionsEl.innerHTML = '<div class="small" style="padding:12px">暂无会话，点击“新建”开始</div>'; return; }
  keys.forEach(id=>{
    const s = sessions[id];
    const item = document.createElement('div');
    item.className = 'session-item' + (currentSession && currentSession.id===id ? ' active' : '');
    item.innerHTML = `<div style="flex:1"><div class="session-meta">${escapeHtml(s.name)}</div><div class="session-sub small">${(s.messages?.length||0)} 条消息</div></div>`;
    item.addEventListener('click', ()=> selectSession(id));
    const actions = document.createElement('div'); actions.className='session-actions';
    const del = document.createElement('button'); del.className='small'; del.textContent='删除';
    del.addEventListener('click', e=>{ e.stopPropagation(); if(confirm('删除会话？')){ deleteSession(id); if(currentSession?.id===id){ currentSession=null; loadCurrentSession(); } renderSessionList(); } });
    actions.appendChild(del); item.appendChild(actions);
    sessionsEl.appendChild(item);
  });
}

function selectSession(id){ const sessions = loadSessions(); if(!sessions[id]) return; currentSession = sessions[id]; loadCurrentSession(); renderSessionList(); }

function loadCurrentSession(){ chat.innerHTML=''; if(!currentSession){ sessionTitle.textContent='未选择会话'; sessionIdDisplay.textContent=''; return; } sessionTitle.textContent=currentSession.name; sessionIdDisplay.textContent='ID: '+currentSession.id; (currentSession.messages||[]).forEach(m=> appendMessage(m.text, m.role)); }

async function sendMessage(){
  if(sending) return;
  const text = input.value.trim();
  if(!text) return;

  if(!currentSession){ currentSession = createSession('默认会话'); renderSessionList(); }
  currentSession.messages = currentSession.messages || [];
  currentSession.messages.push({ role:'user', text, time: Date.now() });
  const all = loadSessions(); all[currentSession.id] = currentSession; saveSessions(all);

  // clear input and show user message
  input.value=''; appendMessage(text,'user'); sending=true; sendBtn.disabled=true; controller = new AbortController();

  // remove previous loading bubble if any (shouldn't normally happen because sending is gated)
  if(currentLoadingBubble){ try{ currentLoadingBubble.remove(); }catch(e){} currentLoadingBubble = null; }

  // 立即创建一个带有“正在思考...”占位与 loading-dots 的 bot 气泡
  let botEl = createBotBubble('正在思考...', true);
  currentLoadingBubble = botEl;
  const contentDiv = botEl.querySelector('.content');
  let loadingEl = botEl.querySelector('.loading-dots');
  const metaEl = botEl.querySelector('.meta');

  try{
    const res = await fetch('/chat', {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8', 'Accept':'text/event-stream, text/plain, */*' },
      body: new URLSearchParams({ messages: text, id: currentSession.id }).toString(),
      signal: controller.signal
    });

    if(!res.ok) throw new Error('网络错误 '+res.status);

    if(res.body){
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated='';
      let firstChunk = true;
      while(true){
        const { value, done } = await reader.read();
        if(done) break;
        const chunk = decoder.decode(value,{stream:true});
        const cleaned = chunk.replace(/\r/g,'').replace(/^data:\s*/gm,'');
        accumulated += cleaned;

        if(firstChunk){
          // 首次收到数据时移除 loading 指示，并清空占位文本
          if(loadingEl){ loadingEl.remove(); loadingEl = null; }
          // reset meta to plain AI to remove any stray spaces/dots reliably
          if(metaEl) metaEl.innerHTML = 'AI';
          currentLoadingBubble = botEl; // keep reference while streaming
          contentDiv.innerHTML = '';
          firstChunk = false;
        }

        contentDiv.innerHTML = escapeHtml(accumulated);
        chat.scrollTop = chat.scrollHeight;
      }

      const finalText = accumulated;
      contentDiv.innerHTML = escapeHtml(finalText);
      // 确保移除 loading dots（若尚未移除）并 reset meta
      if(loadingEl){ loadingEl.remove(); loadingEl = null; }
      if(metaEl) metaEl.innerHTML = 'AI';
      currentLoadingBubble = null;

      currentSession.messages.push({ role:'bot', text: finalText, time: Date.now() });
      const s = loadSessions(); s[currentSession.id] = currentSession; saveSessions(s);

    } else {
      // 非流式响应，也在同一个 bot 气泡中展示结果
      const reply = await res.text();
      // remove loading and normalize meta
      if(loadingEl){ loadingEl.remove(); loadingEl = null; }
      if(metaEl) metaEl.innerHTML = 'AI';
      contentDiv.innerHTML = escapeHtml(reply);
      currentLoadingBubble = null;

      currentSession.messages.push({ role:'bot', text: reply, time: Date.now() });
      const s = loadSessions(); s[currentSession.id] = currentSession; saveSessions(s);
    }
  } catch(err){
    // 出错时在同一气泡中显示错误并移除 loading 指示
    if(botEl){
      if(loadingEl){ loadingEl.remove(); loadingEl = null; }
      if(metaEl) metaEl.innerHTML = 'AI';
      contentDiv.innerHTML = escapeHtml('（错误）' + (err.message || '请求失败'));
      currentLoadingBubble = null;
    } else {
      if(err.name === 'AbortError') appendMessage('请求已取消','bot'); else appendMessage('请求失败：'+err.message,'bot');
    }
  } finally{
    sending=false; sendBtn.disabled=false; controller=null; renderSessionList();
  }
}

// auto resize textarea
function autosizeTextarea(el){ el.style.height='auto'; el.style.height=(el.scrollHeight)+'px'; }
input.addEventListener('input', ()=> autosizeTextarea(input));

// bind
sendBtn.addEventListener('click', e=>{ e.preventDefault(); sendMessage(); });
newBtn.addEventListener('click', ()=>{ const name = prompt('会话名称：','新会话'); const s = createSession(name||undefined); renderSessionList(); selectSession(s.id); });
input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });

// init
window.addEventListener('load', ()=>{ const sessions = loadSessions(); if(Object.keys(sessions).length===0){ currentSession = createSession('默认会话'); } else { const keys = Object.keys(sessions); currentSession = sessions[keys[keys.length-1]]; } renderSessionList(); loadCurrentSession(); autosizeTextarea(input); input.focus(); });
