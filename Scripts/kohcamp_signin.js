/*
-----------------------------------------
@Author: JaveleyQAQ 
@Date: 2025-10-30 11:00
@Description: 王者营地自动签到
图标：https://raw.githubusercontent.com/leiyiyan/resource/main/icons/lhtj.png

[Script]
http-request ^https?:\/\/kohcamp\.qq\.com\/operation\/action\/signinfo script-path=https://raw.githubusercontent.com/JaveleyQAQ/Loon-config/refs/heads/main/Scripts/kohcamp_signin.js, timeout=60, tag=王者营地获取Cookie
cron "0 0 * * *" script-path=https://raw.githubusercontent.com/JaveleyQAQ/Loon-config/refs/heads/main/Scripts/kohcamp_signin.js, timeout=60, tag=王者营地每日签到👋

[MITM]
hostname = kohcamp.qq.com
*/

const $ = new Env('kohcamp 营地签到');
const ckName = 'kohcamp_data';
const ICON = 'https://raw.githubusercontent.com/leiyiyan/resource/main/icons/lhtj.png';
let accounts = loadAccounts();
$.notify = [];

// 通用 HTTP 请求
async function http(o) {
  try {
    if (typeof o === 'string') o = { url: o };
    const res = await Request({ ...o, headers: o.headers || { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json' }, url: o.url });
    return res;
  } catch (e) {
    return { __error: true, message: e && e.message ? e.message : String(e) };
  }
}

// 执行签到
async function doSignin(acc) {
  const url = 'https://kohcamp.qq.com/operation/action/newsignin';
  const headers = {
    Host: 'kohcamp.qq.com',
    Referer: 'https://camp.qq.com/',
    token: acc.token || '',
    userId: acc.userId || '',
    campRoleId: acc.campRoleId || '',
    cookie: acc.cookie || ''
  };
  const body = {
    cSystem: 'ios',
    h5Get: 1,
    gameId: '20001',
    roleId: acc.roleId || acc.campRoleId || ''
  };
  const res = await http({ url, type: 'post', dataType: 'json', headers, body });
  let note = '';
  if (!res) note = '请求无响应';
  else if (res.__error) note = '请求错误: ' + res.message;
  else {
    const json = res.data ? res.data : (typeof res === 'object' ? res : {});
    const rc = json.returnCode ?? json.code ?? (res.returnCode ?? undefined);
    if (rc === 0) {
      const txt = json.data && json.data.text ? json.data.text : JSON.stringify(json.data || json);
      note = '✅ 签到成功: ' + txt;
    } else if (rc === -105203 || (json.returnMsg && /请勿重复签到/.test(json.returnMsg))) {
      note = '⛔️ 重复签到: ' + (json.returnMsg || JSON.stringify(json));
    } else {
      note = '⛔️ 签到失败: ' + (json.returnMsg || JSON.stringify(json));
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

// 捕获并保存 cookie/token 等
async function captureCookie() {
  if (typeof $request === 'undefined') return;
  if ($request && $request.method === 'OPTIONS') return;
  const url = $request.url || '';
  if (!/operation\/action\/signinfo/.test(url)) return;

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
    return;
  }

  const idx = accounts.findIndex(a => a.token && newData.token && a.token === newData.token);
  if (idx !== -1) accounts[idx] = Object.assign({}, accounts[idx], newData);
  else accounts.push(newData);

  saveAccounts(accounts);
  $.msg('🎉 获取Cookie成功', '', `已保存 ${newData.userName} (${newData.userId || 'no-userId'})`, { icon: ICON });
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
  .finally(() => { $.done({ ok: 1 }); });

// ---------- 持久化兼容层 ----------
function saveAccounts(obj) {
  const s = JSON.stringify(obj);
  try { if (typeof $persistentStore !== 'undefined') return $persistentStore.write(s, ckName); } catch (e) {}
  try { if (typeof $prefs !== 'undefined' && $prefs.setValue) return $prefs.setValue(s, ckName); } catch (e) {}
  try { if (typeof $storage !== 'undefined' && $storage.setItem) return $storage.setItem(ckName, s); } catch (e) {}
  try { if (typeof $task !== 'undefined' && $task.set) return $task.set(ckName, s); } catch (e) {}
  try { if (typeof localStorage !== 'undefined') return localStorage.setItem(ckName, s); } catch (e) {}
  // Node 环境不自动写文件，保留 process.env 方案供用户自行扩展
}

function loadAccounts() {
  try { if (typeof $persistentStore !== 'undefined') { const v = $persistentStore.read(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof $prefs !== 'undefined' && $prefs.valueForKey) { const v = $prefs.valueForKey(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof $storage !== 'undefined' && $storage.getItem) { const v = $storage.getItem(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof $task !== 'undefined' && $task.get) { const v = $task.get(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof localStorage !== 'undefined') { const v = localStorage.getItem(ckName); return v ? JSON.parse(v) : []; } } catch (e) {}
  try { if (typeof process !== 'undefined' && process.env && process.env[ckName]) return JSON.parse(process.env[ckName]); } catch (e) {}
  return [];
}

// ---------- 辅助函数 ----------
function ObjectKeys2LowerCase(headers) { const out = {}; try { for (const k in headers) out[k.toLowerCase()] = headers[k]; } catch (e) {} return out; }

function Env(name) {
  this.name = name;
  this.isNode = function () { try { return typeof module !== 'undefined' && !!module.exports; } catch (e) { return false; } };
  this.getdata = function (k) { try { if (this.isNode()) return process.env[k]; if (typeof $persistentStore !== 'undefined') return $persistentStore.read(k); if (typeof $prefs !== 'undefined' && $prefs.valueForKey) return $prefs.valueForKey(k); return null; } catch (e) { return null; } };
  this.setjson = function (obj, k) { try { saveAccounts(obj); } catch (e) { } };
  this.toObj = function (s) { try { if (typeof s === 'string') return JSON.parse(s); return s || []; } catch (e) { return s || []; } };
  this.msg = function (title, subtitle, body, opts) { try { if (this.isNode()) console.log(title + '\n' + (body || '')); else $notification.post(title, subtitle || '', body || '', opts || {}); } catch (e) {} };
  this.done = function () { };
}
