'use strict';
// Kiểm căn cứ: mọi con số AI viết phải truy được về dữ liệu đầu vào (cho phép sai số làm tròn và đổi đơn vị).
// Câu có con số không truy được bị loại.

const RE_TOKEN = /[-−]?\d[\d.,]*/g;
const RE_THOI_GIAN = /^\s*(tháng|năm|quý|kỳ|ngày|tuần|phiên|q\b)/i;

function docSo(tok) {
  let s = tok.replace(/^[-−]/, '').replace(/[.,]+$/, '');
  const am = /^[-−]/.test(tok);
  let v, d = 0;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) { const [a, b] = s.split(','); v = +(a.replace(/\./g, '') + (b ? '.' + b : '')); d = b ? b.length : 0; }
  else if (/^\d+,\d+$/.test(s)) { v = +s.replace(',', '.'); d = s.split(',')[1].length; }
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) { const [a, b] = s.split('.'); v = +(a.replace(/,/g, '') + (b ? '.' + b : '')); d = b ? b.length : 0; }
  else if (/^\d+\.\d+$/.test(s)) { v = +s; d = s.split('.')[1].length; }
  else if (/^\d+$/.test(s)) v = +s;
  else return null;
  return Number.isFinite(v) ? { v: am ? -v : v, d } : null;
}

// Các con số "trần" trong một đoạn văn (bỏ số dính chữ như R05, C32, Q3; bỏ năm; bỏ số đếm nhỏ và số chỉ thời gian).
function soTrongVanBan(text) {
  const out = [];
  String(text).replace(RE_TOKEN, (tok, i, all) => {
    const truoc = all[i - 1] || '';
    if (/[\p{L}_/]/u.test(truoc)) return tok;
    const sau = all.slice(i + tok.length);
    if (/^[\p{L}]/u.test(sau) && !/^(%|tỷ|triệu|nghìn|ngàn|lần|đ|x\b)/i.test(sau)) return tok;
    const x = docSo(tok);
    if (!x) return tok;
    const a = Math.abs(x.v);
    if (x.d === 0 && a >= 1990 && a <= 2100) return tok;
    if (x.d === 0 && a <= 12) return tok;
    if (x.d === 0 && a <= 60 && RE_THOI_GIAN.test(sau)) return tok;
    out.push({ ...x, tok });
    return tok;
  });
  return out;
}

const HE_SO = [1, 100, 0.01, 1e-3, 1e-6, 1e-9, 1e-12];
function tapSo(...nguon) {
  const a = [];
  const them = v => { if (Number.isFinite(v) && v !== 0) HE_SO.forEach(k => a.push(Math.abs(v * k))); };
  const duyet = (o, sau) => {
    if (sau > 12 || o === null || o === undefined) return;
    if (typeof o === 'number') them(o);
    else if (typeof o === 'string') { if (o.length < 5000) soTrongVanBanThuan(o).forEach(x => them(x.v)); }
    else if (Array.isArray(o)) o.forEach(x => duyet(x, sau + 1));
    else if (typeof o === 'object') Object.values(o).forEach(x => duyet(x, sau + 1));
  };
  nguon.forEach(o => duyet(o, 0));
  a.push(0);
  return Float64Array.from(a).sort();
}
// Đầu vào: lấy mọi con số (kể cả năm, số nhỏ) để không bỏ sót.
function soTrongVanBanThuan(text) {
  const out = [];
  String(text).replace(RE_TOKEN, tok => { const x = docSo(tok); if (x) out.push(x); return tok; });
  return out;
}

function coTrongTap(tap, x) {
  const v = Math.abs(x.v), tol = 0.5 * Math.pow(10, -x.d) + 1e-9;
  let lo = 0, hi = tap.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (tap[m] < v - tol) lo = m + 1; else hi = m; }
  return lo < tap.length && Math.abs(tap[lo] - v) <= tol;
}

const tachCau = s => String(s).split(/(?<=[.!?…;])\s+(?=[\p{Lu}\d"“(])/u);

// Trả về { text, loai: số câu bị loại, cau_loai: [{ cau, so }] }.
function locVanBan(text, tap) {
  if (!text) return { text: '', loai: 0, cau_loai: [] };
  const cauLoai = [];
  const giu = tachCau(text).filter(c => {
    const sai = soTrongVanBan(c).filter(x => !coTrongTap(tap, x));
    if (sai.length) cauLoai.push({ cau: c.trim(), so: sai.map(x => x.tok) });
    return !sai.length;
  });
  return { text: giu.join(' ').trim(), loai: cauLoai.length, cau_loai: cauLoai };
}
const hopLe = (text, tap) => soTrongVanBan(text).every(x => coTrongTap(tap, x));

module.exports = { docSo, soTrongVanBan, tapSo, coTrongTap, locVanBan, hopLe };
