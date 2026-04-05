// 将原 index.html 中的脚本迁移到 app.js，保留功能并做小幅增强
const SESSIONS_KEY = 'ai_chat_sessions_v1';

function loadSessions(){ try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)||'{}'); } catch(e){ return {}; } }
function saveSessions(s){ localStorage.setItem(SESSIONS_KEY, JSON.stringify(s)); }

function createSession(name){
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9);
  const sessions = loadSessions();
  // 添加 created 时间用于排序（新会话在上方）
  sessions[id] = { id, name: name||('会话 '+(Object.keys(sessions).length+1)), messages: [], created: Date.now() };
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
let uploadInProgress = false; // 新增：防重入
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

  // 将会话对象转为数组并按 created 倒序排序，新会话显示在上方
  const list = Object.values(sessions).slice().sort((a,b)=>{
    const ta = a && a.created ? a.created : 0;
    const tb = b && b.created ? b.created : 0;
    return tb - ta;
  });

  list.forEach(s=>{
    const id = s.id;
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

// 新增：上传函数（AJAX 优先）
async function uploadFile(){
  if(uploadInProgress) { console.warn('upload already in progress'); return; }
  uploadInProgress = true;
  try{
    const fileInputEl = document.getElementById('fileInput');
    const uploadStatusEl = document.getElementById('uploadStatus');
    if(!fileInputEl || !fileInputEl.files || !fileInputEl.files[0]){ if(uploadStatusEl) uploadStatusEl.textContent = '请选择文件'; uploadInProgress = false; return; }
    const file = fileInputEl.files[0];
    if(uploadStatusEl) uploadStatusEl.textContent = '上传中...';
    const form = new FormData(); form.append('file', file, file.name);
    const res = await fetch('/upload', { method: 'POST', body: form });
    if(!res.ok){ const txt = await res.text().catch(()=>res.statusText); if(uploadStatusEl) uploadStatusEl.textContent = '上传失败: '+(txt||res.status); alert('上传失败: '+(txt||res.status)); uploadInProgress=false; return; }
    if(uploadStatusEl) uploadStatusEl.textContent = '上传成功';
    alert('上传成功: '+file.name);
    setTimeout(()=>{ if(uploadStatusEl && uploadStatusEl.textContent==='上传成功') uploadStatusEl.textContent='未选择文件'; }, 2000);
  }catch(e){ console.error('uploadFile error', e); const uploadStatusEl = document.getElementById('uploadStatus'); if(uploadStatusEl) uploadStatusEl.textContent = '上传错误'; alert('上传出错: '+(e.message||e)); }
  finally{ uploadInProgress = false; }
}

// 新增：初始化上传控件的方法，确保多时机绑定并暴露 uploadFile
function initUploadControls(){
  try{
    if(window.__uploadControlsInit) return; // 防止重复初始化
    const fileInputEl = document.getElementById('fileInput');
    const uploadBtnEl = document.getElementById('uploadBtn');
    const uploadStatusEl = document.getElementById('uploadStatus');
    if(!fileInputEl){ console.log('initUploadControls: fileInput not found'); return; }

    // 初始按钮状态
    // 允许上传按钮在未选中文件时仍可点击（点击会弹出文件选择），以避免用户误以为按钮无反应
    if(uploadBtnEl) uploadBtnEl.disabled = false;

    // 选择文件时显示文件名并启用上传按钮
    fileInputEl.addEventListener('change', function(){
      try{
        if(this.files && this.files[0]){
          if(uploadStatusEl) uploadStatusEl.textContent = this.files[0].name;
          if(uploadBtnEl) uploadBtnEl.disabled = false;
        } else {
          if(uploadStatusEl) uploadStatusEl.textContent = '未选择文件';
          if(uploadBtnEl) uploadBtnEl.disabled = false; // 保持可点击以允许打开对话
        }
      }catch(e){ console.error('fileInput change handler error', e); }
    });

    // 上传按钮触发上传（防重且有提示）
    if(uploadBtnEl){
      uploadBtnEl.addEventListener('click', function(e){
        try{
          e.preventDefault(); console.log('uploadBtn clicked');
          // 如果尚未选择文件，则打开文件选择对话而不是显示错误（更友好）
          if(!fileInputEl || !fileInputEl.files || !fileInputEl.files[0]){
            if(fileInputEl) fileInputEl.click();
            if(uploadStatusEl) uploadStatusEl.textContent = '请选择文件';
            return;
          }
          // 否则开始上传
          uploadFile();
        }catch(err){ console.error('uploadBtn click handler', err); }
      });
    }

    // 暴露到全局，便于调试或内联回退使用
    window.uploadFile = uploadFile;
    window.__uploadControlsInit = true;
    console.log('upload controls initialized');
  }catch(err){ console.error('initUploadControls failed', err); }
}

// auto resize textarea
function autosizeTextarea(el){ el.style.height='auto'; el.style.height=(el.scrollHeight)+'px'; }
input.addEventListener('input', ()=> autosizeTextarea(input));

// bind
sendBtn.addEventListener('click', e=>{ e.preventDefault(); sendMessage(); });
newBtn.addEventListener('click', ()=>{ const name = prompt('会话名称：','新会话'); const s = createSession(name||undefined); renderSessionList(); selectSession(s.id); });
input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });

// init
window.addEventListener('load', ()=>{
  const sessions = loadSessions();
  if(Object.keys(sessions).length===0){ currentSession = createSession('默认会话'); } else {
    const list = Object.values(sessions).slice().sort((a,b)=>{ const ta = a && a.created ? a.created : 0; const tb = b && b.created ? b.created : 0; return tb - ta; });
    currentSession = list[0];
  }
  renderSessionList(); loadCurrentSession(); autosizeTextarea(input); input.focus();

  // 绑定上传控件相关事件（在 DOM 就绪后）
  try{
    initUploadControls();
  }catch(e){ console.error('initUploadControls threw on load', e); }

});

// 也在 DOMContentLoaded 时尝试初始化（防止部分环境 load 时机差异）
document.addEventListener('DOMContentLoaded', function(){ try{ initUploadControls(); }catch(e){ console.error('initUploadControls threw on DOMContentLoaded', e); } });
