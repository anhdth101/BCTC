'use strict';
// Hàm dùng chung cho bộ ước lượng hệ số Altman Z″ cho Việt Nam.
const fs = require('fs');
const path = require('path');

const THU_MUC = __dirname;
const CACHE = path.join(THU_MUC, 'cache');
const VND_BASE = 'https://api-finfo.vndirect.com.vn/v4';
const VND_H = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' };

const nghi = ms => new Promise(r => setTimeout(r, ms));

async function layJson(url, headers, ms = 15000, lanThu = 3) {
  let loi;
  for (let lan = 0; lan < lanThu; lan++) {
    if (lan) await nghi(1500 * lan);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { headers, signal: ctrl.signal });
      if (r.status === 404) return null;
      if (!r.ok) { loi = new Error(`HTTP ${r.status}`); continue; }
      return await r.json();
    } catch (e) { loi = e; } finally { clearTimeout(t); }
  }
  throw loi;
}

// Chạy fn trên từng phần tử với số luồng giới hạn, giãn cách giữa các lượt để không bị nguồn chặn.
async function chayGioiHan(ds, soLuong, gianCachMs, fn) {
  let i = 0;
  const tho = async () => {
    while (i < ds.length) {
      const x = ds[i++];
      try { await fn(x); } catch (e) { console.error(`  ! ${x}: ${e.message}`); }
      await nghi(gianCachMs);
    }
  };
  await Promise.all(Array.from({ length: soLuong }, tho));
}

const docJson = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const ghiJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };

function thamSo(argv) {
  const o = {};
  argv.slice(2).forEach(a => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); if (m) o[m[1]] = m[2] === undefined ? true : m[2]; });
  return o;
}

// ===== Biến Altman =====
const so = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const tri = v => (so(v) === null ? null : Math.abs(v));
const chia = (a, b) => (so(a) === null || so(b) === null || b <= 0 ? null : a / b);

// Từ dòng năm y và năm y−1 (dữ liệu Vietcap) tính bộ biến chuẩn và bộ biến hiệu chỉnh Việt Nam.
function bienAltman(bs, is, cf, bsTruoc) {
  const TA = so(bs.bsa53), CA = so(bs.bsa1), CL = so(bs.bsa55), TL = so(bs.bsa54), EQ = so(bs.bsa78), RE = so(bs.bsa90);
  if (!TA || TA <= 0 || [CA, CL, TL, EQ, RE].some(v => v === null)) return null;
  const LNTT = so(is.isa16);
  if (LNTT === null) return null;
  const laiVay = tri(is.isa8) || 0;
  const EBIT = LNTT + laiVay;
  const lnKhac = (so(is.isa12) || 0) - (tri(is.isa13) || 0);
  const nguoiMua = so(bs.bsa58) || 0;
  const gw = so(bs.bsa209) || so(bs.bsa48) || 0;
  // Lợi nhuận chuyển thành vốn góp: vốn góp tăng mà không thu tiền phát hành. Không tách được phần lấy từ thặng dư nên là cận trên.
  let reVon = 0;
  if (bsTruoc && so(bs.bsa80) !== null && so(bsTruoc.bsa80) !== null) {
    const tangVon = bs.bsa80 - bsTruoc.bsa80, tienPh = so(cf && cf.cfa27) || 0;
    if (tangVon > 0) reVon = Math.max(0, Math.min(tangVon, tangVon - tienPh));
  }
  return {
    X1: chia(CA - CL, TA), X2: chia(RE, TA), X3: chia(EBIT, TA), X4: chia(EQ, TL),
    X1vn: chia(CA - (CL - nguoiMua), TA), X2vn: chia(RE + reVon, TA), X3vn: chia(EBIT - lnKhac, TA), X4vn: chia(EQ - gw, TL),
    ocf_ta: chia(so(cf && cf.cfa18), TA), ln_ta: Math.log(TA), dt_ta: chia(so(is.isa3), TA)
  };
}

// Z″ EM của Altman với hệ số gốc.
const zEm = b => 3.25 + 6.56 * b.X1 + 3.26 * b.X2 + 6.72 * b.X3 + 1.05 * b.X4;

// ===== Nhãn =====
const LOAI_NANG = ['control', 'halt', 'suspend', 'delistedHose', 'delistedHnx', 'delistedUpcom'];
// Huỷ niêm yết do chuyển sàn tự nguyện, sáp nhập… không phải kiệt quệ.
const RE_BO = /chuyển sàn|chuyển niêm yết|chuyển sang niêm yết|tự nguyện|sáp nhập|hợp nhất|chuyển đổi loại hình|niêm yết tại sở/i;

function suKienNang(ev, coCanhBao) {
  const loai = coCanhBao ? LOAI_NANG.concat(['alert']) : LOAI_NANG;
  return (ev || []).filter(x => loai.includes(x.type) && !RE_BO.test(String(x.note || '') + ' ' + String(x.typeDesc || '')))
    .map(x => ({ ngay: String(x.effectiveDate || x.disclosureDate || '').slice(0, 10), loai: x.type, ly_do: String(x.note || '').slice(0, 160) }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.ngay));
}

// Năm tài chính y: báo cáo kiểm toán công bố chậm nhất ~31/03/y+1. Nhãn = 1 nếu có sự kiện nặng trong cửa sổ "thang" tháng kể từ 01/04/y+1.
function nhan(y, suKien, thang) {
  const bd = `${y + 1}-04-01`;
  const kt = new Date(Date.UTC(y + 1, 3 + thang, 1)).toISOString().slice(0, 10);
  const sau = suKien.filter(x => x.ngay >= bd && x.ngay < kt);
  const truoc = suKien.filter(x => x.ngay < bd && x.ngay >= `${y}-04-01`);
  return { y: sau.length ? 1 : 0, da_xau_truoc: truoc.length > 0, su_kien: sau.map(x => `${x.ngay} ${x.loai}`).join('; ') };
}

module.exports = { THU_MUC, CACHE, VND_BASE, VND_H, nghi, layJson, chayGioiHan, docJson, ghiJson, thamSo, so, bienAltman, zEm, suKienNang, nhan };
