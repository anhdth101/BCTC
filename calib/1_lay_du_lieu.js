'use strict';
// Bước 1: tải BCTC năm nhiều năm (Vietcap) và lịch sử xử lý giao dịch (VNDirect) cho danh sách mã, lưu vào calib/cache/.
// Đã có cache thì bỏ qua (chạy lại được khi bị ngắt).
//
//   node calib/1_lay_du_lieu.js --tat-ca                 mọi mã đang niêm yết + đã huỷ niêm yết
//   node calib/1_lay_du_lieu.js --ma=PIV,GEX,VIC         chỉ các mã này
//   tuỳ chọn: --luong=2 (số luồng)  --nghi=1200 (ms giữa 2 mã mỗi luồng)  --lam-moi (bỏ qua cache)
const path = require('path');
const fs = require('fs');
const C = require('./chung');
const { _internal: A } = require('../api/analyze.js');

async function danhSachMa(ts) {
  if (ts.ma) return String(ts.ma).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const ds = [];
  for (const tt of ['listed', 'delisted']) {
    const j = await C.layJson(`${C.VND_BASE}/stocks?q=type:STOCK~status:${tt}&size=6000&fields=code,floor,status`, C.VND_H, 20000);
    (j && j.data || []).forEach(x => { if (/^[A-Z0-9]{3}$/.test(x.code || '')) ds.push(x.code); });
  }
  return [...new Set(ds)].sort();
}

(async () => {
  const ts = C.thamSo(process.argv);
  const ds = await danhSachMa(ts);
  if (!ds.length) { console.error('Không lấy được danh sách mã. Dùng --ma=AAA,BBB hoặc --tat-ca.'); process.exit(1); }
  const luong = +ts.luong || 2, nghi = +ts.nghi || 1200;
  console.log(`Tải ${ds.length} mã, ${luong} luồng, nghỉ ${nghi} ms.`);
  let xong = 0, boQua = 0, loi = 0;
  await C.chayGioiHan(ds, luong, nghi, async ma => {
    const f = path.join(C.CACHE, `${ma}.json`);
    if (!ts['lam-moi'] && fs.existsSync(f)) { boQua++; return; }
    let vci = null, ev = null, sk = null;
    try { vci = await A.layVci(ma); } catch (e) { loi++; }
    try { ev = await C.layJson(`${C.VND_BASE}/events?q=code:${ma}~group:stockAlert~locale:VN&sort=effectiveDate:desc&size=200`, C.VND_H); } catch (e) { /* bỏ qua */ }
    try { sk = await C.layJson(`${C.VND_BASE}/stocks?q=code:${ma}`, C.VND_H); } catch (e) { /* bỏ qua */ }
    const cty = vci && vci.cty || {};
    C.ghiJson(f, {
      ma, luc: new Date().toISOString(),
      loai_cty: cty.comTypeCode || '', san: sk && sk.data && sk.data[0] && sk.data[0].floor || '', trang_thai: sk && sk.data && sk.data[0] && sk.data[0].status || '',
      nam: vci ? ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'].reduce((o, s) => (o[s] = ((vci[s] || {}).years || []), o), {}) : null,
      su_kien: ev && ev.data || []
    });
    if (++xong % 25 === 0) console.log(`  ${xong} mã mới đã tải…`);
  });
  console.log(`Xong: ${xong} mã mới, ${boQua} mã có sẵn trong cache, ${loi} mã không có BCTC từ Vietcap. Cache: ${C.CACHE}`);
})();
