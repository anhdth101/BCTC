'use strict';
// Bước 5: kiểm chứng ngược bộ quy tắc ngân hàng (lib/quy_tac_ngan_hang.js).
// Nhãn "xấu" của năm y: năm y+1 tỷ lệ nợ xấu tăng ≥ 0,5 điểm % HOẶC LNST giảm ≥ 30% (kể cả chuyển lỗ).
// Ghi lib/quy_tac_ngan_hang_backtest.json.
//
//   node calib/5_backtest_ngan_hang.js            (tự tải BCTC + thuyết minh cho các mã ngân hàng chưa có trong calib/cache_nh)
//   tuỳ chọn: --lam-moi  --nam-chia=2021  --ma=SSB,VPB (in chi tiết từng năm, không ghi file)
const fs = require('fs');
const path = require('path');
const C = require('./chung');
const { _internal: A } = require('../api/analyze.js');

// --nhom=nh (mặc định, ngân hàng) | ck (công ty chứng khoán)
const ts = C.thamSo(process.argv);
const NHOM = String(ts.nhom || 'nh').toLowerCase() === 'ck' ? 'ck' : 'nh';
const Q = NHOM === 'ck' ? require('../lib/quy_tac_chung_khoan') : require('../lib/quy_tac_ngan_hang');
const CACHE_NH = path.join(C.THU_MUC, NHOM === 'ck' ? 'cache_ck' : 'cache_nh');
const OUT = path.join(C.THU_MUC, '..', 'lib', NHOM === 'ck' ? 'quy_tac_chung_khoan_backtest.json' : 'quy_tac_ngan_hang_backtest.json');

function maNganHang() {
  return fs.readdirSync(C.CACHE).filter(f => f.endsWith('.json')).map(f => C.docJson(path.join(C.CACHE, f)))
    .filter(d => d && (NHOM === 'ck' ? String(d.loai_cty).toUpperCase() === 'CK'
      : (String(d.loai_cty).toUpperCase() === 'NH' || (d.nam && (d.nam.BALANCE_SHEET || []).some(r => Number(r.bsb104))))))
    .map(d => d.ma).sort();
}

async function taiMa(ma) {
  const f = path.join(CACHE_NH, `${ma}.json`);
  if (!ts['lam-moi'] && fs.existsSync(f)) return C.docJson(f);
  const v = await A.layVci(ma);
  const d = { ma, bs: (v.BALANCE_SHEET || {}).years || [], is: (v.INCOME_STATEMENT || {}).years || [], cf: (v.CASH_FLOW || {}).years || [], note: (v.NOTE || {}).years || [] };
  C.ghiJson(f, d);
  await C.nghi(800);
  return d;
}

const lgam = z => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = z, x = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const v of c) s += v / ++y; return -t + Math.log(2.5066282746310005 * s / x); };
const pTren = (k, n, p) => { if (k <= 0) return 1; if (p <= 0) return 0; if (p >= 1) return 1; let s = 0; for (let i = k; i <= n; i++) s += Math.exp(lgam(n + 1) - lgam(i + 1) - lgam(n - i + 1) + i * Math.log(p) + (n - i) * Math.log(1 - p)); return Math.min(1, s); };
const r4 = v => (v === null || v === undefined || !Number.isFinite(v) ? null : +v.toFixed(4));

(async () => {
  const ds = ts.ma ? String(ts.ma).split(',').map(s => s.trim().toUpperCase()) : maNganHang();
  console.log(`${NHOM === 'ck' ? 'Công ty chứng khoán' : 'Ngân hàng'}: ${ds.length} mã (${ds.join(', ')})`);
  const duLieu = [];
  for (const ma of ds) { try { duLieu.push(await taiMa(ma)); } catch (e) { console.error(`  ! ${ma}: ${e.message}`); } }

  if (ts.ma) {
    for (const d of duLieu) {
      console.log(`\n=== ${d.ma}`);
      const ys = [...new Set(d.bs.map(r => +r.yearReport))].sort();
      for (const y of ys) {
        const kq = Q.danhGia(d, y), n = Q.nhan(d, y);
        console.log(`${y} nhãn=${n ? (n.xau ? 1 : 0) : '–'}${n ? ` (nợ xấu tăng: ${n.npl_tang}, LNST giảm: ${n.lnst_giam})` : ''} · ${kq.filter(r => r.kich_hoat).map(r => r.id).join(',') || '–'}`);
      }
    }
    return;
  }

  const mau = [];
  for (const d of duLieu) {
    const ys = [...new Set(d.bs.map(r => +r.yearReport))].sort();
    for (const y of ys) {
      const n = Q.nhan(d, y);
      if (!n) continue;
      const kq = Q.danhGia(d, y);
      if (kq.every(r => r.kich_hoat === null)) continue;
      mau.push({ ma: d.ma, nam: y, nhan: n.xau ? 1 : 0, npl: n.npl_tang ? 1 : 0, ln: n.lnst_giam ? 1 : 0, kh: Object.fromEntries(kq.map(r => [r.id, r.kich_hoat])) });
    }
  }
  const N = mau.length, X = mau.filter(r => r.nhan).length;
  const namCo = [...new Set(mau.map(r => r.nam))].sort();
  const namChia = +ts['nam-chia'] || 2021;
  console.log(`Mẫu: ${N} ${Q.DON_VI} (${namCo[0]}–${namCo[namCo.length - 1]}), ${X} ca xấu (nền ${(100 * X / Math.max(1, N)).toFixed(1)}%): nợ xấu tăng ${mau.filter(r => r.npl).length}, lợi nhuận giảm ${mau.filter(r => r.ln).length}.`);

  const thongKe = (dsm, id) => {
    const co = dsm.filter(r => r.kh[id] !== null && r.kh[id] !== undefined), kh = co.filter(r => r.kh[id]);
    const n = kh.length, xau = kh.filter(r => r.nhan).length, nen = co.length ? co.filter(r => r.nhan).length / co.length : 0;
    return { n_du_lieu: co.length, n, xau, ty_le: n ? xau / n : null, nen, lift: n && nen ? xau / n / nen : null, p: n ? pTren(xau, n, nen) : null,
      npl: kh.filter(r => r.npl).length, ln: kh.filter(r => r.ln).length };
  };
  const hl = mau.filter(r => r.nam <= namChia), kd = mau.filter(r => r.nam > namChia);
  // Mẫu nhỏ: ngưỡng số lần kích hoạt thấp hơn bộ phi tài chính; mức "manh" bắt buộc ổn định ở cả hai giai đoạn.
  const phanMuc = (a, h, k) => {
    if (a.n >= 15 && a.lift >= 1.8 && a.p < 0.05 && h.lift !== null && h.lift > 1 && k.lift !== null && k.lift > 1) return 'manh';
    if (a.n >= 10 && a.lift >= 1.3 && a.p < 0.10 && (h.lift === null || h.lift >= 1) && (k.lift === null || k.lift >= 1)) return 'vua';
    return 'yeu';
  };
  const kq = {};
  for (const q of Q.QUY_TAC) {
    const a = thongKe(mau, q.id), h = thongKe(hl, q.id), k = thongKe(kd, q.id);
    kq[q.id] = { ten: q.ten, dieu_kien: q.dieu_kien, n_du_lieu: a.n_du_lieu, n: a.n, xau: a.xau, ty_le: r4(a.ty_le), nen: r4(a.nen), lift: r4(a.lift), p: r4(a.p),
      bat_npl: a.npl, bat_lnst: a.ln, huan_luyen: { n: h.n, xau: h.xau, lift: r4(h.lift) }, kiem_dinh: { n: k.n, xau: k.xau, lift: r4(k.lift) }, muc: phanMuc(a, h, k) };
  }
  const out = { ngay: new Date().toISOString().slice(0, 10),
    nhan: Q.NHAN, don_vi: Q.DON_VI,
    mau: { n: N, xau: X, nen: r4(X / Math.max(1, N)), so_ma: duLieu.length, tu_nam: namCo[0], den_nam: namCo[namCo.length - 1], nam_chia: namChia },
    canh_bao: 'Mẫu nhỏ (một ngân hàng đóng góp nhiều năm, các năm cùng chịu chu kỳ chung). Chỉ dùng làm tham khảo.',
    quy_tac: kq };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  const pc = v => (v === null ? '–' : (100 * v).toFixed(1) + '%');
  console.log('\nQuy tắc | kích hoạt | xấu | tỷ lệ xấu | lift | p | lift HL/KĐ | mức');
  for (const [id, r] of Object.entries(kq))
    console.log(`${id} ${r.ten.padEnd(44)} ${String(r.n).padStart(4)} ${String(r.xau).padStart(3)} ${pc(r.ty_le).padStart(7)} ${r.lift === null ? '   –' : r.lift.toFixed(2).padStart(5)} ${r.p === null ? '–' : r.p.toFixed(3)} ${r.huan_luyen.lift === null ? '–' : r.huan_luyen.lift.toFixed(2)}/${r.kiem_dinh.lift === null ? '–' : r.kiem_dinh.lift.toFixed(2)} ${r.muc}`);
  console.log(`\nGhi ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
