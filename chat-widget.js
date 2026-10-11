/* dotBRO live chat: a small "Talk to us" box for people on the site.
   - Visitors write to the dotBRO team; replies appear in the same box.
   - Shows how many people are on the site right now (Supabase Realtime presence).
   - Messages go through two database functions (see docs/chat-schema.sql); the table itself is closed to the public.
   - Any language: the visitor picks (or we detect) their language. They can type or speak in it, and replies are translated
     on their own device when the browser supports it (Chrome's built-in translator). The team sees the original text plus the language code.
   - Two tabs: "Team" (private chat with dotBRO) and "Everyone" (a public room, see docs/chat-room-schema.sql; shown guidelines first).
   - Loads supabase-js by itself if the page has not already done so. No other dependency. */
(function () {
  "use strict";
  if (window.__dotbroChat) return;
  window.__dotbroChat = true;

  var SUPABASE_URL = "https://fliheqjbwmcoggajovln.supabase.co";
  var SUPABASE_KEY = "sb_publishable_qaGLnY9bUZ3nhveVw-64xg_kDuJLfHt";   // publishable key: safe in the browser by design
  var LS_THREAD = "dotbro.chat.thread", LS_NAME = "dotbro.chat.name", LS_LANG = "dotbro.chat.lang", LS_ALOUD = "dotbro.chat.aloud", LS_AGREE = "dotbro.room.agreed", LS_RNAME = "dotbro.room.name", LS_MINE = "dotbro.room.mine";
  var LANGS = [["auto", "Detect my language"], ["en", "English"], ["hi", "\u0939\u093f\u0928\u094d\u0926\u0940"], ["bn", "\u09ac\u09be\u0982\u09b2\u09be"], ["ta", "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd"], ["te", "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41"],
    ["mr", "\u092e\u0930\u093e\u0920\u0940"], ["gu", "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0"], ["kn", "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1"], ["ml", "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02"], ["pa", "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40"],
    ["ur", "\u0627\u0631\u062f\u0648"], ["ar", "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"], ["es", "Espa\u00f1ol"], ["fr", "Fran\u00e7ais"], ["de", "Deutsch"], ["pt", "Portugu\u00eas"],
    ["ru", "\u0420\u0443\u0441\u0441\u043a\u0438\u0439"], ["zh", "\u4e2d\u6587"], ["ja", "\u65e5\u672c\u8a9e"], ["ko", "\ud55c\uad6d\uc5b4"]];
  var BCP = { en: "en-IN", hi: "hi-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", mr: "mr-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", ur: "ur-IN", ar: "ar-SA", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR", ru: "ru-RU", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR" };
  var lang = store(LS_LANG) || "auto";
  function curLang() { var l = lang === "auto" ? String(navigator.language || "en").split("-")[0].toLowerCase() : lang; return BCP[l] ? l : "en"; }

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256; });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; var h = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  var thread = store(LS_THREAD) || uuid(); store(LS_THREAD, thread);

  var css = '\
  .dbc-btn,.dbc-panel{--dbc-bg:#fffdf8;--dbc-ink:#1c1b19;--dbc-mut:#6a665c;--dbc-line:#e1dccf;--dbc-acc:#b8862b;--dbc-acc-ink:#1c1b19;--dbc-me:#f3ead6;font:16px/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif;letter-spacing:.01em;box-sizing:border-box}\
  @media (prefers-color-scheme:dark){.dbc-btn,.dbc-panel{--dbc-bg:#16181c;--dbc-ink:#f1ede3;--dbc-mut:#a49f93;--dbc-line:#2d3138;--dbc-acc:#d4a54a;--dbc-me:#2a2619}}\
  .dbc-btn{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:999px;border:1px solid var(--dbc-line);background:var(--dbc-bg);color:var(--dbc-ink);box-shadow:0 10px 30px -12px rgba(0,0,0,.45);cursor:pointer;font-weight:600}\
  .dbc-btn:focus-visible,.dbc-panel button:focus-visible,.dbc-panel input:focus-visible,.dbc-panel textarea:focus-visible{outline:2px solid var(--dbc-acc);outline-offset:2px}\
  .dbc-dot{width:9px;height:9px;border-radius:50%;background:#2f9e63;display:inline-block}\
  .dbc-badge{display:none;width:10px;height:10px;border-radius:50%;background:#d9573a}\
  .dbc-panel{position:fixed;right:18px;bottom:78px;z-index:2147483001;width:min(360px,calc(100vw - 24px));height:min(600px,calc(100vh - 110px));display:none;flex-direction:column;background:var(--dbc-bg);color:var(--dbc-ink);border:1px solid var(--dbc-line);border-radius:18px;box-shadow:0 24px 60px -20px rgba(0,0,0,.55);overflow:hidden}\
  .dbc-panel[data-open="1"]{display:flex}\
  .dbc-head{padding:14px 16px;border-bottom:1px solid var(--dbc-line);display:flex;justify-content:space-between;align-items:center}\
  .dbc-head b{font-size:16px}.dbc-head span{color:var(--dbc-mut);font-size:13px;display:block}\
  .dbc-x{all:unset;cursor:pointer;padding:6px 10px;border-radius:8px;color:var(--dbc-mut);font-size:20px;line-height:1}\
  .dbc-log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}\
  .dbc-msg{max-width:84%;padding:9px 13px;border-radius:14px;border:1px solid var(--dbc-line);white-space:pre-wrap;word-wrap:break-word}\
  .dbc-msg.me{align-self:flex-end;background:var(--dbc-me)}.dbc-msg.team{align-self:flex-start}\
  .dbc-msg small{display:block;color:var(--dbc-mut);font-size:12px;margin-bottom:2px}\
  .dbc-note{color:var(--dbc-mut);font-size:13px;text-align:center;padding:2px 8px}\
  .dbc-form{border-top:1px solid var(--dbc-line);padding:10px;display:grid;gap:6px}\
  .dbc-form input,.dbc-form textarea{box-sizing:border-box;max-width:100%;font:inherit;color:var(--dbc-ink);background:transparent;border:1px solid var(--dbc-line);border-radius:10px;padding:9px 11px;width:100%;resize:none}\
  .dbc-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dbc-tools select{font:inherit;font-size:14px;color:var(--dbc-ink);background:transparent;border:1px solid var(--dbc-line);border-radius:8px;padding:5px 8px;max-width:100%}\
  .dbc-tools input{width:auto!important;padding:0!important}.dbc-tools label{font-size:13px;color:var(--dbc-mut);display:flex;gap:5px;align-items:center}\
  .dbc-mic{all:unset;cursor:pointer;border:1px solid var(--dbc-line);border-radius:10px;padding:9px 12px;font-size:14px;color:var(--dbc-ink)}.dbc-mic[aria-pressed="true"]{background:#d9573a;color:#fff;border-color:transparent}\
  .dbc-row .dbc-mic{background:transparent;color:var(--dbc-ink);border:1px solid var(--dbc-line);font-weight:600;padding:9px 12px}.dbc-row .dbc-mic[aria-pressed="true"]{background:#d9573a;color:#fff;border-color:transparent}\
  .dbc-orig{display:block;color:var(--dbc-mut);font-size:12px;margin-top:3px}\
  .dbc-row{display:flex;gap:8px}.dbc-row button{all:unset;cursor:pointer;background:var(--dbc-acc);color:var(--dbc-acc-ink);font-weight:700;padding:10px 18px;border-radius:10px;text-align:center}\
  .dbc-row button[disabled]{opacity:.5;cursor:default}.dbc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}\
\
  .dbc-tabs{display:flex;border-bottom:1px solid var(--dbc-line)}\
  .dbc-tabs button{all:unset;cursor:pointer;flex:1;text-align:center;padding:10px 6px;font-weight:600;font-size:14px;color:var(--dbc-mut);border-bottom:2px solid transparent}\
  .dbc-tabs button[aria-selected="true"]{color:var(--dbc-ink);border-bottom-color:var(--dbc-acc)}\
  .dbc-tabs button:focus-visible{outline:2px solid var(--dbc-acc);outline-offset:-2px}\
  .dbc-view{flex:1;min-height:0;display:none;flex-direction:column}.dbc-view[data-on="1"]{display:flex}\
  .dbc-guide{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px;font-size:14px}\
  .dbc-guide h3{margin:0;font-size:16px}.dbc-guide p{margin:0}.dbc-guide button{all:unset;cursor:pointer;background:var(--dbc-acc);color:var(--dbc-acc-ink);font-weight:700;padding:11px 18px;border-radius:10px;text-align:center}\
  .dbc-msg.crowd{align-self:flex-start;max-width:90%}.dbc-msg.crowd.team{border-color:var(--dbc-acc)}.dbc-msg.crowd.me{align-self:flex-end}\
  .dbc-link{all:unset;cursor:pointer;color:var(--dbc-mut);font-size:12px;text-decoration:underline;text-align:center}\
  @media (prefers-reduced-motion:no-preference){.dbc-panel{animation:dbc-in .18s ease-out}@keyframes dbc-in{from{opacity:0;transform:translateY(8px)}}}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var btn = el("button", "dbc-btn"); btn.type = "button"; btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
  var dot = el("span", "dbc-dot"), label = el("span", "", "Talk to us"), online = el("span", "", ""), badge = el("span", "dbc-badge");
  online.style.cssText = "font-weight:400;opacity:.7;font-size:14px"; btn.append(dot, label, online, badge);

  var panel = el("div", "dbc-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Chat with the dotBRO team");
  var head = el("div", "dbc-head"), ht = el("div"), hb = el("b", "", "dotBRO"), hs = el("span", "", "Ask us anything. We reply here.");
  ht.append(hb, hs); var close = el("button", "dbc-x", "×"); close.type = "button"; close.setAttribute("aria-label", "Close chat"); head.append(ht, close);
  var log = el("div", "dbc-log"); log.setAttribute("aria-live", "polite");
  var form = el("form", "dbc-form");
  var nameIn = el("input"); nameIn.placeholder = "Your name (optional)"; nameIn.maxLength = 60; nameIn.autocomplete = "given-name"; nameIn.value = store(LS_NAME) || "";
  var hp = el("input", "dbc-hp"); hp.tabIndex = -1; hp.setAttribute("aria-hidden", "true"); hp.autocomplete = "off"; hp.name = "website";
  var text = el("textarea"); text.rows = 2; text.maxLength = 600; text.placeholder = "Write a message"; text.setAttribute("aria-label", "Message");
  var tools = el("div", "dbc-tools"), langSel = el("select"); langSel.setAttribute("aria-label", "Language");
  LANGS.forEach(function (l) { var o = el("option", "", l[1]); o.value = l[0]; if (l[0] === lang) o.selected = true; langSel.append(o); });
  var aloudLab = el("label"), aloud = el("input"); aloud.type = "checkbox"; aloud.checked = store(LS_ALOUD) === "1"; aloudLab.append(aloud, document.createTextNode("Read replies aloud"));
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, mic = null;
  tools.append(langSel); if (window.speechSynthesis) tools.append(aloudLab);
  text.dir = "auto";
  var row = el("div", "dbc-row"), send = el("button", "", "Send"); send.type = "submit";
  if (SR) { mic = el("button", "dbc-mic", "\ud83c\udfa4 Speak"); mic.type = "button"; mic.setAttribute("aria-pressed", "false"); row.append(mic); }
  row.append(send);
  var note = el("div", "dbc-note", "Write or speak in any language. We keep your message so we can reply. Please do not share passwords or card numbers.");
  form.append(tools, nameIn, hp, text, row, note);
  var teamView = el("div", "dbc-view"); teamView.dataset.on = "1"; teamView.append(log, form);
  var tabs = el("div", "dbc-tabs"); tabs.setAttribute("role", "tablist");
  var tabTeam = el("button", "", "Team"), tabRoom = el("button", "", "Everyone");
  [tabTeam, tabRoom].forEach(function (b) { b.type = "button"; b.setAttribute("role", "tab"); }); tabs.append(tabTeam, tabRoom);
  /* the public room */
  var roomView = el("div", "dbc-view");
  var guide = el("div", "dbc-guide"), gh = el("h3", "", "Before you join the room");
  var GUIDE = [
    "This is a public room. Everyone online can read what you write, in any language.",
    "Be kind. No hate, threats, bullying or harassment.",
    "Keep yourself safe: do not share phone numbers, emails, your address, passwords or card numbers. Links are not allowed. Do not share other people’s private details.",
    "If you are in danger or feel you may hurt yourself, contact your local emergency services now. In India you can call Tele-MANAS on 14416 (free). This room is not a crisis service.",
    "The team can delete messages and block people who break these rules.",
    "Privacy: we turn your internet (IP) address into a scrambled code, only to stop spam and block abuse. Nobody else sees it, and it is erased after 7 days. Your name is optional and public."
  ];
  guide.append(gh); GUIDE.forEach(function (t) { guide.append(el("p", "", t)); });
  var agreeBtn = el("button", "", "I agree. Enter the room"); agreeBtn.type = "button"; guide.append(agreeBtn);
  var roomLog = el("div", "dbc-log"); roomLog.setAttribute("aria-live", "polite");
  var roomForm = el("form", "dbc-form");
  var rName = el("input"); rName.placeholder = "Your name (optional, public)"; rName.maxLength = 30; rName.autocomplete = "given-name"; rName.value = store(LS_RNAME) || "";
  var rHp = el("input", "dbc-hp"); rHp.tabIndex = -1; rHp.setAttribute("aria-hidden", "true"); rHp.autocomplete = "off"; rHp.name = "homepage";
  var rText = el("textarea"); rText.rows = 2; rText.maxLength = 300; rText.placeholder = "Say something to everyone"; rText.setAttribute("aria-label", "Message to everyone"); rText.dir = "auto";
  var rRow = el("div", "dbc-row"), rSend = el("button", "", "Send"); rSend.type = "submit"; rRow.append(rSend);
  var rNote = el("div", "dbc-note", "Public. Please do not share contact details, passwords or card numbers."), rGuideLink = el("button", "dbc-link", "Read the guidelines again"); rGuideLink.type = "button";
  roomForm.append(rName, rHp, rText, rRow, rNote, rGuideLink);
  roomView.append(guide, roomLog, roomForm);
  panel.append(head, tabs, teamView, roomView);
  document.body.append(panel, btn);

  var sb = null, lastId = 0, open = false, seen = {}, pollTimer = null, unread = false;

  function setOnline(n) { online.textContent = n > 0 ? "· " + n + " online" : ""; }
  var tcache = {};
  /* Translate a team reply into the visitor's language on their own device (Chrome's built-in Translator and LanguageDetector).
     Anywhere that is not available, the original text is shown as it is. */
  function localize(body, done) {
    var target = curLang();
    if (!window.Translator || !window.LanguageDetector) return done(body, null);
    var key = target + "|" + body; if (tcache[key]) return done(tcache[key], "translated");
    LanguageDetector.create().then(function (det) { return det.detect(body); }).then(function (res) {
      var src = res && res[0] && res[0].detectedLanguage; if (!src || src === target || src === "und") return done(body, null);
      return Translator.availability({ sourceLanguage: src, targetLanguage: target }).then(function (a) {
        if (a === "unavailable") return done(body, null);
        return Translator.create({ sourceLanguage: src, targetLanguage: target }).then(function (t) { return t.translate(body); }).then(function (out) { tcache[key] = out; done(out, "translated"); });
      });
    }).catch(function () { done(body, null); });
  }
  function speakText(t) {
    if (!aloud.checked || !window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(t); u.lang = BCP[curLang()] || "en-IN"; u.rate = 0.95; speechSynthesis.speak(u);
  }
  function addMsg(m) {
    if (seen[m.id]) return; seen[m.id] = 1; if (m.id > lastId) lastId = m.id;
    var me = m.sender === "visitor", d = el("div", "dbc-msg " + (me ? "me" : "team")); d.dir = "auto";
    if (!me) d.append(el("small", "", m.name || "dotBRO team"));
    var body = document.createTextNode(m.body); d.append(body); log.append(d); log.scrollTop = log.scrollHeight;
    if (!me) {
      localize(m.body, function (out, how) {
        if (how) { body.nodeValue = out; var o = el("span", "dbc-orig", "Translated for you. Original: " + m.body); d.append(o); }
        speakText(out); log.scrollTop = log.scrollHeight;
      });
      if (!open) { unread = true; badge.style.display = "inline-block"; }
    }
  }
  function say(t) { var n = el("div", "dbc-note", t); log.append(n); log.scrollTop = log.scrollHeight; return n; }

  function poll() {
    if (!sb) return;
    sb.rpc("chat_read", { p_thread: thread, p_after: lastId }).then(function (r) {
      if (r && Array.isArray(r.data)) r.data.forEach(addMsg);
    }, function () {});
  }
  function schedule() { clearTimeout(pollTimer); pollTimer = setTimeout(function () { poll(); schedule(); }, open ? 4000 : 30000); }

  function start() {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      var ch = sb.channel("dotbro-online", { config: { presence: { key: thread } } });
      ch.on("presence", { event: "sync" }, function () { setOnline(Object.keys(ch.presenceState()).length); })
        .subscribe(function (s) { if (s === "SUBSCRIBED") ch.track({ at: Date.now() }); });
    } catch (e) { sb = null; }
    if (sb) { poll(); schedule(); } else { btn.style.display = "none"; }
  }
  if (window.supabase && window.supabase.createClient) start();
  else { var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; s.crossOrigin = "anonymous"; s.onload = start; s.onerror = function () { btn.style.display = "none"; }; document.head.appendChild(s); }


  /* ---- the public room ---- */
  var tab = "team", roomTimer = null, roomSig = "", rcache = {}, mine = {};
  try { (JSON.parse(store(LS_MINE) || "[]") || []).forEach(function (i) { mine[i] = 1; }); } catch (e) {}
  function saveMine() { var ids = Object.keys(mine).slice(-50); store(LS_MINE, JSON.stringify(ids)); }
  function agreed() { return store(LS_AGREE) === "1"; }
  function showRoomGate() { var a = agreed(); guide.style.display = a ? "none" : "flex"; roomLog.style.display = a ? "flex" : "none"; roomForm.style.display = a ? "grid" : "none"; }
  function drawRoom(rows) {
    var sig = rows.map(function (r) { return r.id; }).join(","); if (sig === roomSig) return; roomSig = sig;
    var atEnd = roomLog.scrollHeight - roomLog.scrollTop - roomLog.clientHeight < 80; roomLog.textContent = "";
    if (!rows.length) { roomLog.append(el("div", "dbc-note", "No messages yet. Say hello to everyone.")); return; }
    rows.forEach(function (m) {
      var me = !!mine[m.id], d = el("div", "dbc-msg crowd " + (m.sender === "team" ? "team" : "") + (me ? " me" : "")); d.dir = "auto";
      d.append(el("small", "", me ? "You" : (m.handle || "Guest")));
      var cached = rcache[m.id], tn = document.createTextNode(cached ? cached.out : m.body); d.append(tn);
      if (cached && cached.how) d.append(el("span", "dbc-orig", "Translated for you. Original: " + m.body));
      else if (!me && !cached) localize(m.body, function (out, how) { rcache[m.id] = { out: out, how: how }; if (how && d.isConnected) { tn.nodeValue = out; d.append(el("span", "dbc-orig", "Translated for you. Original: " + m.body)); } });
      roomLog.append(d);
    });
    if (atEnd) roomLog.scrollTop = roomLog.scrollHeight;
  }
  function roomPoll() {
    if (!sb || !agreed()) return;
    sb.rpc("chat_room_read").then(function (r) { if (r && Array.isArray(r.data)) drawRoom(r.data); }, function () {});
  }
  function roomSchedule() { clearTimeout(roomTimer); if (open && tab === "room") roomTimer = setTimeout(function () { roomPoll(); roomSchedule(); }, 3500); }
  function setTab(t) {
    tab = t; teamView.dataset.on = t === "team" ? "1" : "0"; roomView.dataset.on = t === "room" ? "1" : "0";
    tabTeam.setAttribute("aria-selected", String(t === "team")); tabRoom.setAttribute("aria-selected", String(t === "room"));
    hs.textContent = t === "team" ? "Ask us anything. We reply here." : "Everyone online can talk here.";
    if (t === "room") { showRoomGate(); roomSig = ""; roomPoll(); setTimeout(function () { (agreed() ? rText : agreeBtn).focus(); }, 50); }
    roomSchedule();
  }
  tabTeam.addEventListener("click", function () { setTab("team"); });
  tabRoom.addEventListener("click", function () { setTab("room"); });
  agreeBtn.addEventListener("click", function () { store(LS_AGREE, "1"); showRoomGate(); roomSig = ""; roomPoll(); rText.focus(); });
  rGuideLink.addEventListener("click", function () { store(LS_AGREE, "0"); showRoomGate(); agreeBtn.focus(); });
  rText.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); roomForm.requestSubmit(); } });
  roomForm.addEventListener("submit", function (e) {
    e.preventDefault(); var body = rText.value.trim(); if (!body || !sb) return;
    store(LS_RNAME, rName.value.trim()); rSend.disabled = true;
    sb.rpc("chat_room_send", { p_thread: thread, p_name: rName.value.trim(), p_body: body, p_hp: rHp.value, p_lang: curLang() }).then(function (r) {
      rSend.disabled = false; var d = r && r.data;
      if (r && !r.error && d && d.ok) { rText.value = ""; if (d.id) { mine[d.id] = 1; saveMine(); } roomSig = ""; roomPoll(); }
      else { var n = el("div", "dbc-note", (d && d.error) ? d.error : "That did not send. Please try again in a moment."); roomLog.append(n); roomLog.scrollTop = roomLog.scrollHeight; }
    }, function () { rSend.disabled = false; roomLog.append(el("div", "dbc-note", "That did not send. Please check your connection and try again.")); });
  });
  setTab("team");

  function toggle(v) {
    open = v; panel.dataset.open = v ? "1" : "0"; btn.setAttribute("aria-expanded", String(v));
    if (v) { unread = false; badge.style.display = "none"; if (!log.childNodes.length) say("Hello. Write or speak in any language. The dotBRO team will answer here, and replies are translated for you when your browser can. If we are away, we reply when we are back."); if (tab === "team") setTimeout(function () { text.focus(); }, 50); poll(); }
    schedule(); roomSchedule(); if (v && tab === "room") roomPoll();
  }
  langSel.addEventListener("change", function () { lang = langSel.value; store(LS_LANG, lang); text.lang = curLang(); });
  aloud.addEventListener("change", function () { store(LS_ALOUD, aloud.checked ? "1" : "0"); if (!aloud.checked && window.speechSynthesis) speechSynthesis.cancel(); });
  var rec = null;
  if (mic) mic.addEventListener("click", function () {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = BCP[curLang()] || "en-IN"; rec.interimResults = true; rec.continuous = false; var base = text.value ? text.value + " " : "";
    rec.onstart = function () { mic.setAttribute("aria-pressed", "true"); mic.textContent = "Listening\u2026"; };
    rec.onresult = function (e) { var t = ""; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; text.value = (base + t).slice(0, 600); };
    rec.onerror = function (e) { say(e.error === "not-allowed" ? "The microphone is blocked. Allow it in your browser, or type your message." : "I could not hear that. You can type your message instead."); };
    rec.onend = function () { mic.setAttribute("aria-pressed", "false"); mic.textContent = "\ud83c\udfa4 Speak"; rec = null; text.focus(); };
    try { rec.start(); } catch (e) { rec = null; }
  });
  btn.addEventListener("click", function () { toggle(!open); });
  close.addEventListener("click", function () { toggle(false); btn.focus(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) toggle(false); });
  text.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  form.addEventListener("submit", function (e) {
    e.preventDefault(); var body = text.value.trim(); if (!body || !sb) return;
    store(LS_NAME, nameIn.value.trim()); send.disabled = true;
    sb.rpc("chat_send", { p_thread: thread, p_name: nameIn.value.trim(), p_body: body, p_hp: hp.value, p_lang: curLang() }).then(function (r) {
      send.disabled = false;
      var d = r && r.data;
      if (r && !r.error && d && d.ok) { text.value = ""; poll(); }
      else say((d && d.error) ? d.error : "That did not send. Please try again in a moment.");
    }, function () { send.disabled = false; say("That did not send. Please check your connection and try again."); });
  });
})();
