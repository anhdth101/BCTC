'use strict';
// Bước 4: kiểm chứng ngược bộ quy tắc nghi vấn (lib/quy_tac.js) trên calib/cache.
// Nhãn: bị kiểm soát / tạm ngừng / đình chỉ / huỷ niêm yết bắt buộc trong "thang" tháng kể từ 01/04 năm sau năm tài chính.
// Ghi lib/quy_tac_backtest.json (máy chủ đọc để quyết định quy tắc nào được nêu và nêu ở mức nào).
//
//   node calib/4_backtest_quy_tac.js
//   tuỳ chọn: --thang=24  --co-canh-bao  --giu-da-xau  --tu-nam=2019  --nam-chia=2021
//             --ma=ROS,TTF   (in chi tiết từng năm cho các mã này; không ghi file)
//             --case=ROS,TTF,HVG,NVL,HBC   (danh sách case khó in kèm báo cáo)
const fs = require('fs');
const path = require('path');
const C = require('./chung');
const Q = require('../lib/quy_tac');

const ts = C.thamSo(process.argv);
const thang = +ts.thang || 24, tuNam = +ts['tu-nam'] || 2019;
const namMax = new Date().getFullYear() - 1 - Math.ceil(thang / 12);
const TAI_CHINH = ['NH', 'CK', 'BH'];
const CASE = String(ts.case || 'ROS,TTF,HVG,NVL,HBC,FLC,HAI,OGC,DLG,ITA,AMD,TGG,FTM,HQC').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const OUT = path.join(C.THU_MUC, '..', 'lib', 'quy_tac_backtest.json');

const files = fs.existsSync(C.CACHE) ? fs.readdirSync(C.CACHE).filter(f => f.endsWith('.json')) : [];
if (!files.length) { console.error('Chưa có cache. Chạy calib/1_lay_du_lieu.js trước.'); process.exit(1); }

const docMa = ma => {
  const d = C.docJson(path.join(C.CACHE, `${ma}.json`));
  if (!d || !d.nam) return null;
  return { d, bctc: { bs: d.nam.BALANCE_SHEET || [], is: d.nam.INCOME_STATEMENT || [], cf: d.nam.CASH_FLOW || [] } };
};
const laTaiChinh = (d, bctc) => TAI_CHINH.includes(String(d.loai_cty).toUpperCase()) || bctc.bs.some(r => Number(r.bsb104) || Number(r.bsb113));

// ===== Chế độ xem chi tiết theo mã =====
if (ts.ma) {
  for (const ma of String(ts.ma).split(',').map(s => s.trim().toUpperCase())) {
    const x = docMa(ma);
    if (!x) { console.log(`${ma}: không có dữ liệu trong cache`); continue; }
    const sk = C.suKienNang(x.d.su_kien, !!ts['co-canh-bao']);
    console.log(`\n=== ${ma} · sự kiện: ${sk.map(s => `${s.ngay} ${s.loai}`).join('; ') || 'không'}`);
    const ys = [...new Set(x.bctc.bs.map(r => +r.yearReport))].sort();
    for (const y of ys) {
      const kq = Q.danhGiaQuyTac(x.bctc, y), n = C.nhan(y, sk, thang);
      const kh = kq.filter(r => r.kich_hoat);
      console.log(`${y} nhãn=${n.y}${n.da_xau_truoc ? ' (đã xấu trước)' : ''} · ${kh.length} quy tắc: ${kh.map(r => r.id).join(',') || '–'}`);
      kh.forEach(r => console.log(`   ${r.id} ${Q.QUY_TAC.find(q => q.id === r.id).ten}: ${r.bang_chung.map(([t, v, k]) => `${t} ${Q.fmtBC(v, k)}`).join('; ')}`));
    }
  }
  process.exit(0);
}

// ===== Tạo mẫu =====
const mau = [];
let boTC = 0, boDaXau = 0, soMa = 0;
for (const f of files) {
  const x = docMa(f.replace(/\.json$/, ''));
  if (!x) continue;
  if (laTaiChinh(x.d, x.bctc)) { boTC++; continue; }
  soMa++;
  const sk = C.suKienNang(x.d.su_kien, !!ts['co-canh-bao']);
  const ys = [...new Set(x.bctc.bs.map(r => +r.yearReport))].filter(y => y >= tuNam && y <= namMax);
  for (const y of ys) {
    const n = C.nhan(y, sk, thang);
    if (n.da_xau_truoc && !ts['giu-da-xau']) { boDaXau++; continue; }
    const kq = Q.danhGiaQuyTac(x.bctc, y);
    if (kq.every(r => r.kich_hoat === null)) continue;
    mau.push({ ma: x.d.ma, nam: y, nhan: n.y, kh: Object.fromEntries(kq.map(r => [r.id, r.kich_hoat])) });
  }
}
const N = mau.length, X = mau.filter(r => r.nhan).length, nen = X / Math.max(1, N);
console.log(`Mẫu: ${N} DN–năm (${tuNam}–${namMax}), ${soMa} mã phi tài chính, ${X} ca xấu (nền ${(100 * nen).toFixed(2)}%). Bỏ ${boTC} mã tài chính, ${boDaXau} năm đã xấu trước.`);
if (X < 20) console.warn('⚠ Dưới 20 ca xấu: thống kê chưa đáng tin. Tải thêm mã (calib/1_lay_du_lieu.js --tat-ca).');

// P(X ≥ k) với X ~ Binomial(n, p): một phía.
const lgam = z => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = z, x = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const v of c) s += v / ++y; return -t + Math.log(2.5066282746310005 * s / x); };
const lchoose = (n, k) => lgam(n + 1) - lgam(k + 1) - lgam(n - k + 1);
const pTren = (k, n, p) => { if (k <= 0) return 1; if (p <= 0) return 0; let s = 0; for (let i = k; i <= n; i++) s += Math.exp(lchoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p)); return Math.min(1, s); };

const thongKe = (ds, id) => {
  const co = ds.filter(r => r.kh[id] !== null && r.kh[id] !== undefined), kh = co.filter(r => r.kh[id]);
  const n = kh.length, xau = kh.filter(r => r.nhan).length, nenCo = co.length ? co.filter(r => r.nhan).length / co.length : 0;
  const tyLe = n ? xau / n : null, lift = n && nenCo ? tyLe / nenCo : null;
  const tongXau = co.filter(r => r.nhan).length;
  return { n_du_lieu: co.length, n, xau, ty_le: tyLe, nen: nenCo, lift, recall: tongXau ? xau / tongXau : null, p: n ? pTren(xau, n, nenCo) : null };
};
const namChia = +ts['nam-chia'] || 2021;
const hl = mau.filter(r => r.nam <= namChia), kd = mau.filter(r => r.nam > namChia);

// Mức: manh → được ghi RED FLAG; vua → NGHI VẤN; yeu → chỉ hiển thị trong bảng, AI không được bình luận như nghi vấn.
const phanMuc = (all, a, b) => {
  if (all.n >= 30 && all.lift >= 2 && all.p < 0.05 && (a.lift === null || a.lift > 1) && (b.lift === null || b.lift > 1)) return 'manh';
  if (all.n >= 20 && all.lift >= 1.3 && all.p < 0.10) return 'vua';
  return 'yeu';
};
const r4 = v => (v === null || v === undefined || !Number.isFinite(v) ? null : +v.toFixed(4));
const ketQua = {};
for (const q of Q.QUY_TAC) {
  const all = thongKe(mau, q.id), a = thongKe(hl, q.id), b = thongKe(kd, q.id);
  ketQua[q.id] = { ten: q.ten, dieu_kien: q.dieu_kien, n_du_lieu: all.n_du_lieu, n: all.n, xau: all.xau, ty_le: r4(all.ty_le), nen: r4(all.nen), lift: r4(all.lift), recall: r4(all.recall), p: r4(all.p),
    huan_luyen: { n: a.n, xau: a.xau, lift: r4(a.lift) }, kiem_dinh: { n: b.n, xau: b.xau, lift: r4(b.lift) }, muc: phanMuc(all, a, b) };
}
// Số quy tắc kích hoạt cùng lúc.
const soKh = r => Object.values(r.kh).filter(Boolean).length;
const nhomSo = {};
mau.forEach(r => { const k = Math.min(3, soKh(r)); const g = nhomSo[k] = nhomSo[k] || { n: 0, xau: 0 }; g.n++; g.xau += r.nhan; });
Object.values(nhomSo).forEach(g => { g.ty_le = r4(g.xau / g.n); g.lift = r4(nen ? g.xau / g.n / nen : null); });

// Case khó: mọi năm trong cache (kể cả năm đã xấu), quy tắc kích hoạt và nhãn.
const caseKho = {};
for (const ma of CASE) {
  const x = docMa(ma);
  if (!x) { caseKho[ma] = { loi: 'không có trong cache' }; continue; }
  const sk = C.suKienNang(x.d.su_kien, !!ts['co-canh-bao']);
  const ys = [...new Set(x.bctc.bs.map(r => +r.yearReport))].sort();
  caseKho[ma] = { su_kien: sk.map(s => `${s.ngay} ${s.loai}`), nam: ys.map(y => {
    const kq = Q.danhGiaQuyTac(x.bctc, y), n = C.nhan(y, sk, thang);
    return { nam: y, nhan: n.y, da_xau_truoc: n.da_xau_truoc, quy_tac: kq.filter(r => r.kich_hoat).map(r => r.id) };
  }) };
}

const out = {
  ngay: new Date().toISOString().slice(0, 10),
  nhan: `bị kiểm soát, tạm ngừng, đình chỉ hoặc huỷ niêm yết bắt buộc${ts['co-canh-bao'] ? ' (kể cả cảnh báo)' : ''} trong ${thang} tháng kể từ 01/04 năm sau năm tài chính`,
  mau: { n: N, xau: X, nen: r4(nen), tu_nam: tuNam, den_nam: namMax, so_ma: soMa, nam_chia: namChia },
  quy_tac: ketQua, so_quy_tac_cung_luc: nhomSo, case_kho: caseKho
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

const pc = v => (v === null ? '–' : (100 * v).toFixed(1) + '%');
console.log('\nQuy tắc | kích hoạt | xấu | tỷ lệ xấu | lift | p | lift HL/KĐ | mức');
for (const [id, r] of Object.entries(ketQua))
  console.log(`${id} ${r.ten.padEnd(48)} ${String(r.n).padStart(5)} ${String(r.xau).padStart(4)} ${pc(r.ty_le).padStart(7)} ${r.lift === null ? '   –' : r.lift.toFixed(2).padStart(5)} ${r.p === null ? '–' : r.p.toFixed(3)} ${r.huan_luyen.lift === null ? '–' : r.huan_luyen.lift.toFixed(2)}/${r.kiem_dinh.lift === null ? '–' : r.kiem_dinh.lift.toFixed(2)} ${r.muc}`);
console.log('\nSố quy tắc cùng kích hoạt → tỷ lệ xấu:', Object.entries(nhomSo).map(([k, g]) => `${k}${k === '3' ? '+' : ''}: ${g.xau}/${g.n} = ${pc(g.ty_le)}`).join(' · '));
console.log('\nCase khó:');
for (const [ma, c] of Object.entries(caseKho)) {
  if (c.loi) { console.log(`${ma}: ${c.loi}`); continue; }
  console.log(`${ma} [${c.su_kien.slice(0, 3).join('; ') || 'không có sự kiện nặng'}]`);
  console.log('   ' + c.nam.map(y => `${y.nam}${y.nhan ? '*' : ''}:${y.quy_tac.join('+') || '–'}`).join('  '));
}
console.log(`\nGhi ${OUT}`);
