'use strict';
// Bước 2: từ cache tạo mẫu doanh nghiệp–năm: bộ biến Altman (chuẩn và hiệu chỉnh Việt Nam) + nhãn kiệt quệ, ghi calib/mau.csv.
//
//   node calib/2_tao_mau.js
//   tuỳ chọn: --thang=12 (cửa sổ dự báo sau ngày công bố BCTC năm)  --co-canh-bao (tính cả "cảnh báo" là kiệt quệ)
//             --giu-da-xau (giữ cả năm mà doanh nghiệp đã bị xử lý trước đó; mặc định bỏ để mô hình là dự báo)
//             --tu-nam=2012
const fs = require('fs');
const path = require('path');
const C = require('./chung');

const ts = C.thamSo(process.argv);
const thang = +ts.thang || 12, tuNam = +ts['tu-nam'] || 2012;
const namMax = new Date().getFullYear() - 1 - Math.ceil(thang / 12); // còn đủ thời gian quan sát nhãn
const TAI_CHINH = ['NH', 'CK', 'BH'];

const files = fs.existsSync(C.CACHE) ? fs.readdirSync(C.CACHE).filter(f => f.endsWith('.json')) : [];
if (!files.length) { console.error('Chưa có cache. Chạy calib/1_lay_du_lieu.js trước.'); process.exit(1); }

const COT = ['ma', 'nam', 'nhan', 'X1', 'X2', 'X3', 'X4', 'X1vn', 'X2vn', 'X3vn', 'X4vn', 'ocf_ta', 'ln_ta', 'dt_ta', 'z_em', 'su_kien'];
const dong = [];
let boTC = 0, boThieu = 0, boDaXau = 0;
for (const f of files) {
  const d = C.docJson(path.join(C.CACHE, f));
  if (!d || !d.nam) continue;
  if (TAI_CHINH.includes(String(d.loai_cty).toUpperCase())) { boTC++; continue; }
  const bsN = d.nam.BALANCE_SHEET, isN = d.nam.INCOME_STATEMENT, cfN = d.nam.CASH_FLOW;
  const tim = (arr, y) => arr.find(r => r.yearReport === y);
  // Có dòng ngân hàng (bsb104, isb27) thì cũng bỏ.
  if (bsN.some(r => Number(r.bsb104) || Number(r.bsb113))) { boTC++; continue; }
  const sk = C.suKienNang(d.su_kien, !!ts['co-canh-bao']);
  for (const bs of bsN) {
    const y = bs.yearReport;
    if (!(y >= tuNam && y <= namMax)) continue;
    const is = tim(isN, y), cf = tim(cfN, y);
    if (!is) { boThieu++; continue; }
    const b = C.bienAltman(bs, is, cf || {}, tim(bsN, y - 1));
    if (!b) { boThieu++; continue; }
    const n = C.nhan(y, sk, thang);
    if (n.da_xau_truoc && !ts['giu-da-xau']) { boDaXau++; continue; }
    dong.push({ ma: d.ma, nam: y, nhan: n.y, ...b, z_em: C.zEm(b), su_kien: n.su_kien });
  }
}
const csv = [COT.join(',')].concat(dong.map(r => COT.map(k => {
  const v = r[k];
  return typeof v === 'number' ? (Number.isFinite(v) ? +v.toPrecision(8) : '') : `"${String(v === null || v === undefined ? '' : v).replace(/"/g, "'")}"`;
}).join(','))).join('\n');
fs.writeFileSync(path.join(C.THU_MUC, 'mau.csv'), csv);
const soXau = dong.filter(r => r.nhan === 1).length;
console.log(`Mẫu: ${dong.length} doanh nghiệp–năm (${tuNam}–${namMax}), ${soXau} kiệt quệ (${(100 * soXau / Math.max(1, dong.length)).toFixed(2)}%).`);
console.log(`Bỏ: ${boTC} mã ngành tài chính, ${boThieu} năm thiếu số liệu, ${boDaXau} năm đã bị xử lý trước đó.`);
console.log(`Ghi ${path.join(C.THU_MUC, 'mau.csv')}`);
