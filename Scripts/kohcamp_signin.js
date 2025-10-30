/*
-----------------------------------------
@Author: JaveleyQAQ 
@Date: 2025-10-30 11:00
@Description: 王者营地自动签到（修正版）
图标：https://raw.githubusercontent.com/leiyiyan/resource/main/icons/lhtj.png

[Script]
http-request ^https?:\/\/kohcamp\.qq\.com\/operation\/action\/signinfo script-path=https://raw.githubusercontent.com/JaveleyQAQ/Loon-config/refs/heads/main/Scripts/kohcamp_signin.js, timeout=60, requires-body=true, tag=王者营地获取Cookie
cron "0 0 * * *" script-path=https://raw.githubusercontent.com/JaveleyQAQ/Loon-config/refs/heads/main/Scripts/kohcamp_signin.js, timeout=60, tag=王者营地每日签到👋

[MITM]
hostname = kohcamp.qq.com
*/
const $ = new Env('kohcamp 营地签到');
const ckName = 'kohcamp_data';
const ICON = 'https://raw.githubusercontent.com/leiyiyan/resource/main/icons/lhtj.png';
let accounts = loadAccounts();
$.notify = [];

// 通用 HTTP 请求（使用 Request/环境原生）
async function http(o) {
  try {
    if (typeof o === 'string') o = { url: o };
    const res = await Request({ ...o, headers: o.headers || { 'Accept': 'application/json, text/plain, */*' }, url: o.url });
    return res;
  } catch (e) {
    return { __error: true, message: e && e.message ? e.message : String(e) };
  }
}

// 执行签到（body 改为 x-www-form-urlencoded）
async function doSignin(acc) {
  const url = 'https://kohcamp.qq.com/operation/action/newsignin';
  const headers = {
    Host: 'kohcamp.qq.com',
    Referer: 'https://camp.qq.com/',
    token: acc.token || '',
    userId: acc.userId || '',
    campRoleId: acc.campRoleId || '',
    cookie: acc.cookie || '',
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  const bodyStr = `cSystem=ios&h5Get=1&gameId=20001&roleId=${encodeURIComponent(acc.roleId || acc.campRoleId || '')}`;

  // 注意：把 body 作为字符串传入，避免框架把它序列化为 JSON
  const res = await http({ url, type: 'post', dataType: 'json', headers, body: bodyStr });
  let note = '';
  if (!res) note = '请求无响应';
  else if (res.__error) note = '请求错误: ' + res.message;
  else {
    // Request 可能会把响应放在 res.data 或直接在 res
    const json = res.data ? res.data : (typeof res === 'object' ? res : {});
    const rc = json.returnCode ?? json.code ?? (res.returnCode ?? undefined);
    if (rc === 0) {
      const txt = json.data && json.data.text ? json.data.text : JSON.stringify(json.data || json);
      note = '✅ 签到成功: ' + txt;
    } else if (rc === -105203 || (json.returnMsg && /请勿重复签到/.test(json.returnMsg))) {
      note = '⛔️ 重复签到: ' + (json.returnMsg || JSON.stringify(json));
    } else {
      // 如果服务端返回空对象，显示原始响应以便调试
      note = '⛔️ 签到失败: ' + (json.returnMsg || JSON.stringify(json) || JSON.stringify(res));
    }
  }
  const title = acc.userName ? `${acc.userName} 签到结果` : 'kohcamp 签到结果';
  $.notify.push({ title, body: note });
  if (!$.isNode()) $.msg(title, '', note, { icon: ICON });
}

// 从 $request 提取 header/body/query
function extractFromRequest() {
  const header = ObjectKeys2LowerCase($request.headers || {});
  let bodyObj = {};
  try { bodyObj = $request.body ? JSON.parse($request.body) : {}; } catch (e) { bodyObj = {}; }
  let q = {};
  try {
    if (typeof URL !== 'undefined') {
      const u = new URL($request.url);
      u.searchParams.forEach((v, k) => q[k] = v);
    } else if ($request.url && $request.url.indexOf('?') > -1) {
      const qs = $request.url.split('?')[1];
      qs.split('&').forEach(p => { const kv = p.split('='); if (kv[0]) q[kv[0]] = decodeURIComponent(kv[1] || ''); });
    }
  } catch (e) { q = {}; }
  return { header, bodyObj, q };
}

// 捕获并保存 cookie/token 等（修正：放行原始请求 $done({})）
async function captureCookie() {
  try {
    if (typeof $request === 'undefined') return;
    if ($request && $request.method === 'OPTIONS') {
      if (typeof $done === 'function') $done();
      return;
    }
    const url = $request.url || '';
    if (!/operation\/action\/signinfo/.test(url)) {
      if (typeof $done === 'function') $done();
      return;
    }

    const { header, bodyObj, q } = extractFromRequest();

    const newData = {
      userName: header['x-wx-nickname'] || header['nickname'] || '营地用户',
      token: header['token'] || bodyObj.token || q.token || '',
      userId: header['userid'] || header['userId'] || bodyObj.userId || q.userId || '',
      campRoleId: header['camproleid'] || bodyObj.campRoleId || q.campRoleId || '',
      roleId: bodyObj.roleId || header['roleid'] || q.roleId || '',
      cookie: header['cookie'] || '',
      _raw: $request
    };

    if (!newData.token && !newData.userId && !newData.campRoleId) {
      $.msg('kohcamp 获取信息', '', '未在请求中检测到 token/userId/campRoleId，未保存。', { icon: ICON });
      if (typeof $done === 'function') $done();
      return;
    }

    const idx = accounts.findIndex(a => a.token && newData.token && a.token === newData.token);
    if (idx !== -1) accounts[idx] = Object.assign({}, accounts[idx], newData);
    else accounts.push(newData);

    saveAccounts(accounts);
    $.msg('🎉 获取Cookie成功', '', `已保存 ${newData.userName} (${newData.userId || 'no-userId'})`, { icon: ICON });

  } catch (e) {
    $.msg('捕获异常', '', String(e), { icon: ICON });
  } finally {
    // --------------------------------------------------
    // **关键：放行原始请求，避免 APP 出现网络错误提示**
    // --------------------------------------------------
    try { if (typeof $done === 'function') $done(); } catch (e) { }
  }
}

// 批量 Node 通知
async function nodeNotifyAll() {
  if (!$.isNode()) return;
  try {
    const notify = require('./sendNotify');
    for (const n of $.notify) await notify.sendNotify(n.title, n.body);
  } catch (e) { }
}

// 主流程
async function main() {
  accounts = loadAccounts();
  if (!accounts || accounts.length === 0) {
    $.msg('kohcamp 签到', '', '找不到已保存的账户，请先访问签到页面以获取 Cookie', { icon: ICON });
    return;
  }
  for (const acc of accounts) await doSignin(acc);
  if ($.isNode()) await nodeNotifyAll();
}

// 入口
!(async () => {
  try {
    if (typeof $request !== 'undefined') await captureCookie();
    else await main();
  } catch (e) {
    $.msg('脚本异常', '', e && e.message ? e.message : String(e));
  }
})()
  .finally(() => { try { if (typeof $done === 'function') $done(); } catch (e) {} });

// ----------------- 简单持久化（多平台兼容） -----------------
function saveAccounts(obj) {
  const s = JSON.stringify(obj);
  try { if (typeof $prefs !== 'undefined' && $prefs.setValueForKey) return $prefs.setValueForKey(s, ckName); } catch (e) {}
  try { if (typeof $persistentStore !== 'undefined' && $persistentStore.write) return $persistentStore.write(s, ckName); } catch (e) {}
  try { if (typeof $task !== 'undefined' && $task.set) return $task.set(ckName, s); } catch (e) {}
  try { if (typeof $storage !== 'undefined' && $storage.setItem) return $storage.setItem(ckName, s); } catch (e) {}
  try { if (typeof localStorage !== 'undefined') return localStorage.setItem(ckName, s); } catch (e) {}
  // Node 环境：写入环境变量占位（需要用户自行扩展成文件写入）
  try { if (typeof process !== 'undefined' && process.env) process.env[ckName] = s; } catch (e) {}
}

function loadAccounts() {
  try { if (typeof $prefs !== 'undefined' && $prefs.valueForKey) { const v = $prefs.valueForKey(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof $persistentStore !== 'undefined' && $persistentStore.read) { const v = $persistentStore.read(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof $task !== 'undefined' && $task.get) { const v = $task.get(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof $storage !== 'undefined' && $storage.getItem) { const v = $storage.getItem(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof localStorage !== 'undefined') { const v = localStorage.getItem(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof process !== 'undefined' && process.env && process.env[ckName]) return JSON.parse(process.env[ckName]); } catch (e) {}
  return [];
}

/** ---------------------------------固定不动区域----------------------------------------- */
//prettier-ignore
async function sendMsg(a) { a && ($.isNode() ? await notify.sendNotify($.name, a) : $.msg($.name, $.title || "", a, { "media-url": $.avatar })) }
function DoubleLog(o) { o && ($.log(`${o}`), $.notifyMsg.push(`${o}`)) };
function debug(g, e = "debug") { "true" === $.is_debug && ($.log(`\n-----------${e}------------\n`), $.log("string" == typeof g ? g : $.toStr(g) || `debug error => t=${g}`), $.log(`\n-----------${e}------------\n`)) }
//From xream's ObjectKeys2LowerCase
function ObjectKeys2LowerCase(obj) { return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])) };
//From sliverkiss's Request
async function Request(t) { "string" == typeof t && (t = { url: t }); try { if (!t?.url) throw new Error("[发送请求] 缺少 url 参数"); let { url: o, type: e, headers: r = {}, body: s, params: a, dataType: n = "form", resultType: u = "data" } = t; const p = e ? e?.toLowerCase() : "body" in t ? "post" : "get", c = o.concat("post" === p ? "?" + $.queryStr(a) : ""), i = t.timeout ? $.isSurge() ? t.timeout / 1e3 : t.timeout : 1e4; "json" === n && (r["Content-Type"] = "application/json;charset=UTF-8"); const y = s && "form" == n ? $.queryStr(s) : $.toStr(s), l = { ...t, ...t?.opts ? t.opts : {}, url: c, headers: r, ..."post" === p && { body: y }, ..."get" === p && a && { params: a }, timeout: i }, m = $.http[p.toLowerCase()](l).then((t => "data" == u ? $.toObj(t.body) || t.body : $.toObj(t) || t)).catch((t => $.log(`❌请求发起失败！原因为：${t}`))); return Promise.race([new Promise(((t, o) => setTimeout((() => o("当前请求已超时")), i))), m]) } catch (t) { console.log(`❌请求发起失败！原因为：${t}`) } }
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, r) => { s.call(this, t, ((t, s, a) => { t ? r(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, r) => e(r))) })) } runScript(t, e) { return new Promise((s => { let r = this.getdata("@chavy_boxjs_userCfgs.httpapi"); r = r ? r.replace(/\n/g, "").trim() : r; let a = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); a = a ? 1 * a : 20, a = e && e.timeout ? e.timeout : a; const [i, o] = r.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: a }, headers: { "X-Key": i, Accept: "*/*" }, timeout: a }; this.post(n, ((t, e, r) => s(r))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e); if (!s && !r) return {}; { const r = s ? t : e; try { return JSON.parse(this.fs.readFileSync(r)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e), a = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, a) : r ? this.fs.writeFileSync(e, a) : this.fs.writeFileSync(t, a) } } lodash_get(t, e, s = void 0) { const r = e.replace(/\[(\d+)\]/g, ".$1").split("."); let a = t; for (const t of r) if (a = Object(a)[t], void 0 === a) return s; return a } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, r) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[r + 1]) >> 0 == +e[r + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, r] = /^@(.*?)\.(.*?)$/.exec(t), a = s ? this.getval(s) : ""; if (a) try { const t = JSON.parse(a); e = t ? this.lodash_get(t, r, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, r, a] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(r), o = r ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, a, t), s = this.setval(JSON.stringify(e), r) } catch (e) { const i = {}; this.lodash_set(i, a, t), s = this.setval(JSON.stringify(i), r) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: r, statusCode: a, headers: i, rawBody: o } = t, n = s.decode(o, this.encoding); e(null, { status: r, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: r, response: a } = t; e(r, a, a && s.decode(a.rawBody, this.encoding)) })) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let r = require("iconv-lite"); this.initGotEnv(t); const { url: a, ...i } = t; this.got[s](a, i).then((t => { const { statusCode: s, statusCode: a, headers: i, rawBody: o } = t, n = r.decode(o, this.encoding); e(null, { status: s, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: s, response: a } = t; e(s, a, a && r.decode(a.rawBody, this.encoding)) })) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let r = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in r) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? r[e] : ("00" + r[e]).substr(("" + r[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let r = t[s]; null != r && "" !== r && ("object" == typeof r && (r = JSON.stringify(r)), e += `${s}=${r}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", r = "", a) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: return { url: t.url || t.openUrl || t["open-url"] }; case "Loon": return { openUrl: t.openUrl || t.url || t["open-url"], mediaUrl: t.mediaUrl || t["media-url"] }; case "Quantumult X": return { "open-url": t["open-url"] || t.url || t.openUrl, "media-url": t["media-url"] || t.mediaUrl, "update-pasteboard": t["update-pasteboard"] || t.updatePasteboard }; case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, r, i(a)); break; case "Quantumult X": $notify(e, s, r, i(a)); case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), r && t.push(r), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
