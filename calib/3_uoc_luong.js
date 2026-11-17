'use strict';
// Bước 3: ước lượng lại hệ số Z″ cho Việt Nam bằng hồi quy logistic trên calib/mau.csv, so với Altman EM gốc,
// kiểm định ngoài mẫu theo thời gian, ghi calib/ket_qua.json.
//
//   node calib/3_uoc_luong.js
//   tuỳ chọn: --nam-chia=2021 (huấn luyện ≤ năm này, kiểm định > năm này)  --bien=vn|chuan  --ridge=0.01
//             --ghi-vao-index (thay dòng "const ALTMAN_VN_HIEU_CHINH = …;" trong index.html bằng kết quả)
const fs = require('fs');
const path = require('path');
const C = require('./chung');

const ts = C.thamSo(process.argv);
const BIEN = ts.bien === 'chuan' ? ['X1', 'X2', 'X3', 'X4'] : ['X1vn', 'X2vn', 'X3vn', 'X4vn'];
const ridge = ts.ridge !== undefined ? +ts.ridge : 0.01;

// ===== Đọc mẫu =====
const f = path.join(C.THU_MUC, 'mau.csv');
if (!fs.existsSync(f)) { console.error('Chưa có calib/mau.csv. Chạy calib/2_tao_mau.js trước.'); process.exit(1); }
const [dau, ...hang] = fs.readFileSync(f, 'utf8').trim().split('\n');
const cot = dau.split(',');
const mau = hang.map(h => {
  const v = h.match(/("([^"]*)"|[^,]*)(,|$)/g).map(s => s.replace(/,$/, '').replace(/^"|"$/g, ''));
  const o = {}; cot.forEach((k, i) => { o[k] = ['ma', 'su_kien'].includes(k) ? v[i] : (v[i] === '' ? null : +v[i]); }); return o;
}).filter(r => BIEN.every(k => Number.isFinite(r[k])) && Number.isFinite(r.z_em));

const namCo = [...new Set(mau.map(r => r.nam))].sort();
const namChia = +ts['nam-chia'] || namCo[Math.floor(namCo.length * 0.7)] || 2021;
const hl = mau.filter(r => r.nam <= namChia), kd = mau.filter(r => r.nam > namChia);
const dem = ds => ({ n: ds.length, xau: ds.filter(r => r.nhan === 1).length });
console.log(`Mẫu ${mau.length} (xấu ${dem(mau).xau}); huấn luyện ≤ ${namChia}: ${dem(hl).n} (xấu ${dem(hl).xau}); kiểm định: ${dem(kd).n} (xấu ${dem(kd).xau}).`);
if (dem(hl).xau < 30) console.warn('⚠ Ít hơn 30 trường hợp kiệt quệ trong tập huấn luyện: hệ số sẽ không ổn định. Cần thêm mã/năm.');

// ===== Tiện ích thống kê =====
const phanVi = (a, p) => { const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p; const l = Math.floor(i); return s[l] + (s[Math.ceil(i)] - s[l]) * (i - l); };
// AUC: xác suất một ca kiệt quệ có điểm rủi ro cao hơn một ca bình thường (Mann–Whitney).
function auc(diemRuiRo, y) {
  const ds = diemRuiRo.map((d, i) => [d, y[i]]).sort((a, b) => a[0] - b[0]);
  let hang = 0, tongHangXau = 0, nX = 0;
  for (let i = 0; i < ds.length;) {
    let j = i; while (j < ds.length && ds[j][0] === ds[i][0]) j++;
    const tb = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (ds[k][1] === 1) { tongHangXau += tb; nX++; }
    i = j; hang = j;
  }
  const nT = ds.length - nX;
  return nX && nT ? (tongHangXau - nX * (nX + 1) / 2) / (nX * nT) : null;
}
const sigmoid = z => 1 / (1 + Math.exp(-z));

// Hồi quy logistic bằng Newton–Raphson (IRLS) có phạt ridge nhẹ, trên biến đã chuẩn hoá.
function logistic(X, y, lam) {
  const n = X.length, p = X[0].length + 1;
  let b = new Array(p).fill(0);
  const tyle = y.reduce((s, v) => s + v, 0) / n; b[0] = Math.log(tyle / (1 - tyle));
  for (let it = 0; it < 100; it++) {
    const g = new Array(p).fill(0), H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      const xi = [1, ...X[i]];
      const mu = sigmoid(xi.reduce((s, v, k) => s + v * b[k], 0)), w = mu * (1 - mu);
      for (let a = 0; a < p; a++) { g[a] += (y[i] - mu) * xi[a]; for (let c = 0; c < p; c++) H[a][c] += w * xi[a] * xi[c]; }
    }
    for (let a = 1; a < p; a++) { g[a] -= lam * n * b[a]; H[a][a] += lam * n; }
    const d = giaiHePT(H, g);
    b = b.map((v, k) => v + d[k]);
    if (Math.max(...d.map(Math.abs)) < 1e-8) break;
  }
  return b;
}
function giaiHePT(A, bv) {
  const n = bv.length, M = A.map((r, i) => [...r, bv[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// ===== Cắt đuôi (winsor 1%–99%) theo tập huấn luyện, chuẩn hoá =====
const gioiHan = Object.fromEntries(BIEN.map(k => { const a = hl.map(r => r[k]); return [k, [phanVi(a, 0.01), phanVi(a, 0.99)]]; }));
const cat = (k, v) => Math.min(gioiHan[k][1], Math.max(gioiHan[k][0], v));
const tb = Object.fromEntries(BIEN.map(k => [k, hl.reduce((s, r) => s + cat(k, r[k]), 0) / hl.length]));
const dl = Object.fromEntries(BIEN.map(k => [k, Math.sqrt(hl.reduce((s, r) => s + (cat(k, r[k]) - tb[k]) ** 2, 0) / hl.length) || 1]));
const maTran = ds => ds.map(r => BIEN.map(k => (cat(k, r[k]) - tb[k]) / dl[k]));

const bChuan = logistic(maTran(hl), hl.map(r => r.nhan), ridge);
// Đổi về đơn vị gốc rồi lật dấu để Z càng cao càng an toàn (giống Altman): Z = a0 + Σ ai·Xi, P(kiệt quệ) = 1/(1+e^Z).
const heSo = Object.fromEntries(BIEN.map((k, i) => [k.replace('vn', ''), -bChuan[i + 1] / dl[k]]));
const chan = -(bChuan[0] - BIEN.reduce((s, k, i) => s + bChuan[i + 1] * tb[k] / dl[k], 0));
const zVn = r => chan + BIEN.reduce((s, k) => s + heSo[k.replace('vn', '')] * cat(k, r[k]), 0);

// ===== Ngưỡng trên tập huấn luyện =====
// Nguy hiểm: điểm cắt tối đa hoá Youden (độ nhạy + độ đặc hiệu − 1). An toàn: điểm mà phía trên chỉ còn ≤ 10% số ca kiệt quệ.
function nguong(ds, diem) {
  const z = ds.map(diem), y = ds.map(r => r.nhan), nX = y.filter(v => v).length, nT = y.length - nX;
  const ung = [...new Set(z)].sort((a, b) => a - b);
  let tot = { j: -1, c: null };
  for (const c of ung) {
    const tp = z.filter((v, i) => v < c && y[i]).length, tn = z.filter((v, i) => v >= c && !y[i]).length;
    const j = tp / nX + tn / nT - 1; if (j > tot.j) tot = { j, c };
  }
  const zXau = z.filter((v, i) => y[i]).sort((a, b) => a - b);
  const anToan = zXau[Math.min(zXau.length - 1, Math.floor(zXau.length * 0.9))];
  return { nguy_hiem: tot.c, an_toan: Math.max(anToan, tot.c) };
}
function bang(ds, diem, ng) {
  const r = { nguy_hiem: { n: 0, xau: 0 }, xam: { n: 0, xau: 0 }, an_toan: { n: 0, xau: 0 } };
  ds.forEach(x => { const z = diem(x), v = z < ng.nguy_hiem ? 'nguy_hiem' : z <= ng.an_toan ? 'xam' : 'an_toan'; r[v].n++; r[v].xau += x.nhan; });
  Object.values(r).forEach(v => { v.ty_le_xau = v.n ? +(v.xau / v.n).toFixed(4) : null; });
  const tongXau = ds.filter(x => x.nhan).length;
  r.bat_duoc = tongXau ? +(r.nguy_hiem.xau / tongXau).toFixed(3) : null;
  return r;
}

const ngVn = nguong(hl, zVn);
const ngEm = { nguy_hiem: 4.35, an_toan: 5.85 };
const em = r => r.z_em;
const kq = {
  ngay: new Date().toISOString().slice(0, 10), bien: BIEN, ridge,
  mau: { tong: dem(mau), huan_luyen: { ...dem(hl), den_nam: namChia }, kiem_dinh: dem(kd), tu_nam: namCo[0], den_nam: namCo[namCo.length - 1] },
  he_so_vn: { chan: +chan.toFixed(4), ...Object.fromEntries(Object.entries(heSo).map(([k, v]) => [k, +v.toFixed(4)])) },
  gioi_han_bien: Object.fromEntries(Object.entries(gioiHan).map(([k, v]) => [k.replace('vn', ''), v.map(x => +x.toFixed(4))])),
  nguong_vn: { nguy_hiem: +ngVn.nguy_hiem.toFixed(3), an_toan: +ngVn.an_toan.toFixed(3) },
  auc: {
    altman_em_huan_luyen: auc(hl.map(r => -em(r)), hl.map(r => r.nhan)), altman_em_kiem_dinh: kd.length ? auc(kd.map(r => -em(r)), kd.map(r => r.nhan)) : null,
    vn_huan_luyen: auc(hl.map(r => -zVn(r)), hl.map(r => r.nhan)), vn_kiem_dinh: kd.length ? auc(kd.map(r => -zVn(r)), kd.map(r => r.nhan)) : null
  },
  vung_kiem_dinh: kd.length ? { altman_em: bang(kd, em, ngEm), vn: bang(kd, zVn, ngVn) } : null
};
fs.writeFileSync(path.join(C.THU_MUC, 'ket_qua.json'), JSON.stringify(kq, null, 2));

const p3 = v => (v === null ? '–' : v.toFixed(3));
console.log('\nHệ số Z_VN (Z càng cao càng an toàn; P(kiệt quệ) = 1/(1+e^Z)):');
console.log(`  Z_VN = ${kq.he_so_vn.chan} ${['X1', 'X2', 'X3', 'X4'].map(k => `${kq.he_so_vn[k] >= 0 ? '+' : '−'} ${Math.abs(kq.he_so_vn[k])}·${k}`).join(' ')}`);
console.log(`  So với Altman EM: Z″ = 3,25 + 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4`);
console.log(`Ngưỡng VN: nguy hiểm < ${kq.nguong_vn.nguy_hiem}; an toàn > ${kq.nguong_vn.an_toan}`);
console.log(`AUC (0,5 = đoán mò, 1 = hoàn hảo): Altman EM ${p3(kq.auc.altman_em_huan_luyen)} / ${p3(kq.auc.altman_em_kiem_dinh)} · Z_VN ${p3(kq.auc.vn_huan_luyen)} / ${p3(kq.auc.vn_kiem_dinh)} (huấn luyện / kiểm định)`);
if (kq.vung_kiem_dinh) for (const [ten, v] of Object.entries(kq.vung_kiem_dinh))
  console.log(`  ${ten}: bắt được ${(100 * v.bat_duoc).toFixed(0)}% ca kiệt quệ ở vùng nguy hiểm; tỷ lệ kiệt quệ nguy hiểm/xám/an toàn = ${['nguy_hiem', 'xam', 'an_toan'].map(k => v[k].ty_le_xau === null ? '–' : (100 * v[k].ty_le_xau).toFixed(1) + '%').join(' / ')} (số DN ${['nguy_hiem', 'xam', 'an_toan'].map(k => v[k].n).join(' / ')})`);
console.log(`Ghi ${path.join(C.THU_MUC, 'ket_qua.json')}`);

if (ts['ghi-vao-index']) {
  const fi = path.join(C.THU_MUC, '..', 'index.html');
  const h = fs.readFileSync(fi, 'utf8');
  const cauHinh = { ngay: kq.ngay, mau: `${kq.mau.tong.n} DN–năm ${kq.mau.tu_nam}–${kq.mau.den_nam}, ${kq.mau.tong.xau} ca kiệt quệ`, auc_kiem_dinh: kq.auc.vn_kiem_dinh,
    chan: kq.he_so_vn.chan, he_so: { X1: kq.he_so_vn.X1, X2: kq.he_so_vn.X2, X3: kq.he_so_vn.X3, X4: kq.he_so_vn.X4 }, gioi_han: kq.gioi_han_bien, nguong: kq.nguong_vn };
  const moi = h.replace(/const ALTMAN_VN_HIEU_CHINH = .*?;\n/, `const ALTMAN_VN_HIEU_CHINH = ${JSON.stringify(cauHinh)};\n`);
  if (moi === h) { console.error('Không tìm thấy dòng ALTMAN_VN_HIEU_CHINH trong index.html.'); process.exit(1); }
  fs.writeFileSync(fi, moi);
  console.log('Đã ghi hệ số vào index.html.');
}
