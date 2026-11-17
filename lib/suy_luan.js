'use strict';
// Suy luận có căn cứ cho từng dấu hiệu: câu rút ra trực tiếp từ số liệu của chính doanh nghiệp (phép tính nằm ngay trong câu),
// không dùng giả định ngoài dữ liệu. Chỉ tạo khi dấu hiệu xuất hiện.
const vi = (v, d) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const ty = v => `${vi(v / 1e9, Math.abs(v) >= 1e11 ? 0 : 2)} tỷ`;
const pct = v => `${vi(v * 100, 1)}%`;
const dpt = v => `${vi(v * 100, 1)} điểm %`;
const ok = (...a) => a.every(x => typeof x === 'number' && Number.isFinite(x));
const tl = (a, b) => (ok(a, b) && b > 0 ? a / b : null);
const bq = (a, b) => (ok(a) && ok(b) ? (a + b) / 2 : ok(a) ? a : b);
const cong = (...v) => v.reduce((s, x) => s + (ok(x) ? x : 0), 0);

const DN = {
  R01: (n, t) => ok(n.lnst, t.lnst, n.cfo, t.cfo) && `Hai năm lãi cộng lại ${ty(n.lnst + t.lnst)}, nhưng tiền thu từ kinh doanh cộng lại ${ty(n.cfo + t.cfo)}: lợi nhuận chưa thành tiền, nên cổ tức tiền mặt hay trả nợ phải dựa vào nguồn khác.`,
  R02: (n, t) => ok(n.lnst, n.cfo) && `Lãi ${ty(n.lnst)} nhưng tiền từ kinh doanh chỉ ${ty(n.cfo)}: phần chênh ${ty(n.lnst - n.cfo)} mới nằm trên sổ, chưa có tiền tương ứng.`,
  R03: (n, t) => { const a = tl(t.pt_kh, t.dt), b = tl(n.pt_kh, n.dt); return ok(a, b) && `Thời gian thu tiền khách hàng bình quân dài ra từ ${vi(a * 365, 0)} lên ${vi(b * 365, 0)} ngày (phải thu khách hàng ÷ doanh thu × 365): tiền bán hàng đang nằm lâu hơn ở phía khách hàng.`; },
  R04: (n, t) => { const a = tl(t.ton_kho, t.gv), b = tl(n.ton_kho, n.gv); return ok(a, b) && `Hàng nằm kho bình quân từ ${vi(a * 365, 0)} lên ${vi(b * 365, 0)} ngày (tồn kho ÷ giá vốn × 365); tồn kho ${ty(n.ton_kho)} bằng ${pct(n.ton_kho / n.tts)} tổng tài sản – nếu phải giảm giá để bán, lợi nhuận bị ảnh hưởng trực tiếp.`; },
  R05: n => { const s = cong(n.tra_truoc, n.pt_cho_vay, n.pt_khac, n.pt_khac_dh); const r = tl(s, n.vcsh); return ok(s) && s > 0 && `${ty(s)} đã chi ra dưới dạng ứng trước, cho vay, phải thu khác${r !== null ? `, bằng ${pct(r)} vốn chủ sở hữu (${ty(n.vcsh)})` : ''}: nếu không thu hồi được thì vốn chủ bị hao hụt tương ứng.`; },
  R06: n => { if (!ok(n.lntt, n.ln_gop)) return null; const core = n.ln_gop - (n.cpbh || 0) - (n.cpql || 0); return `Hoạt động bán hàng chính ${core < 0 ? 'lỗ' : 'chỉ lãi'} ${ty(Math.abs(core))} (lợi nhuận gộp − chi phí bán hàng − chi phí quản lý), trong khi lợi nhuận trước thuế ${ty(n.lntt)}: bỏ phần thu nhập ngoài kinh doanh chính thì ${core < 0 ? 'doanh nghiệp lỗ' : 'lợi nhuận giảm mạnh'}.`; },
  R07: (n, t) => { const d = (n.gw || 0) - (t.gw || 0); return ok(n.vcsh) && n.vcsh > 0 && `Lợi thế thương mại ${d >= 0 ? 'tăng' : 'giảm'} ${ty(Math.abs(d))} trong năm, bằng ${pct(Math.abs(d) / n.vcsh)} vốn chủ sở hữu.`; },
  R08: (n, t) => { const vb = bq(n.vay, t.vay), ls = tl(n.lai_vay, vb); return ok(vb, ls) && `Chi phí lãi vay ${ty(n.lai_vay)} trên ${ty(vb)} vay bình quân, tương đương lãi suất ${pct(ls)}/năm: hoặc phần lớn lãi vay đang được cộng vào giá trị tài sản thay vì ghi vào chi phí, hoặc khoản vay có điều kiện ưu đãi bất thường – cả hai đều làm lợi nhuận trên sổ cao hơn chi phí thực của vốn vay.`; },
  R09: (n, t) => { const c1 = cong(n.tien, n.dttc_nh), cb = bq(c1, cong(t.tien, t.dttc_nh)), sl = tl(n.dttc, cb); return ok(sl) && `Giữ ${ty(c1)} tiền và đầu tư ngắn hạn trong khi vay ${ty(n.vay)}, nhưng thu nhập tài chính chỉ bằng ${pct(sl)} số tiền bình quân: số tiền trên sổ có thể không sẵn sàng sử dụng.`; },
  R10: (n, t, t2) => ok(n.xdcb, n.tts) && `Xây dựng dở dang ${ty(n.xdcb)}, bằng ${pct(n.xdcb / n.tts)} tổng tài sản${t2 && ok(t2.xdcb) ? `, không giảm kể từ mức ${ty(t2.xdcb)} hai năm trước` : ''}: phần tài sản này chưa tạo ra doanh thu.`,
  R11: (n, t) => { const g = tl(n.vay - t.vay, t.vay); return ok(n.cfo, t.cfo) && `Hai năm kinh doanh làm hao ${ty(-(n.cfo + t.cfo))} tiền; phần thiếu được bù bằng vay${g !== null ? ` (nợ vay tăng ${pct(g)}, lên ${ty(n.vay)})` : ''}.`; },
  R12: (n, t) => { const m1 = tl(n.ln_gop, n.dt), m0 = tl(t.ln_gop, t.dt), d1 = tl(n.ton_kho, n.gv), d0 = tl(t.ton_kho, t.gv); return ok(m1, m0, d1, d0) && `Biên lợi nhuận gộp tăng ${dpt(m1 - m0)} (từ ${pct(m0)} lên ${pct(m1)}) trong khi hàng nằm kho từ ${vi(d0 * 365, 0)} lên ${vi(d1 * 365, 0)} ngày: bán chậm hơn mà lời dày hơn là điều cần lời giải thích.`; },
  R13: n => { const a = tl(n.ln_cdkks, n.lnst), b = tl(n.cdkks || 0, n.vcsh); return ok(a, b) && `${pct(a)} lợi nhuận thuộc về cổ đông thiểu số ở công ty con, dù phần vốn của họ chỉ bằng ${pct(b)} vốn chủ: cổ đông công ty mẹ hưởng phần nhỏ của lợi nhuận hợp nhất.`; },
  R14: (n, t) => { const giam = t.pt_nh - n.pt_nh, tang = cong(n.pt_dh, n.dttc_dh) - cong(t.pt_dh, t.dttc_dh), chi = cong(n.capex, n.chi_cho_vay, n.chi_gop_von); return ok(giam, tang) && `Phải thu ngắn hạn giảm ${ty(giam)} cùng lúc khoản dài hạn tăng ${ty(tang)}, trong khi tiền chi đầu tư chỉ ${ty(chi)}: phần lớn khoản giảm không phải do thu được tiền.`; },
  R15: (n, t) => { const g = tl(n.dt - t.dt, t.dt); return ok(g, n.cfo, t.cfo) && `Doanh thu tăng ${pct(g)} nhưng tiền từ kinh doanh đi từ ${ty(t.cfo)} xuống ${ty(n.cfo)}: doanh thu tăng thêm chưa mang về tiền.`; },
  R16: n => ok(n.vcsh, n.von_gop) && n.von_gop > 0 && `Vốn chủ còn ${ty(n.vcsh)} trên ${ty(n.von_gop)} vốn góp: mỗi cổ phiếu mệnh giá 10.000 đồng chỉ còn khoảng ${vi(Math.max(0, n.vcsh) / n.von_gop * 10000, 0)} đồng giá trị sổ sách (vốn chủ ÷ vốn góp × 10.000).`
};

const NH = {
  B01: (n, t) => ok(n.lai_phai_thu, t.lai_phai_thu, n.cho_vay) && `Lãi phải thu tăng từ ${ty(t.lai_phai_thu)} lên ${ty(n.lai_phai_thu)}, bằng ${pct(n.lai_phai_thu / n.cho_vay)} dư nợ: phần lãi đã ghi vào thu nhập nhưng khách hàng chưa trả.`,
  B02: n => ok(n.tn_lai_gop, n.lai_thuc_thu) && `Ngân hàng mới thu được ${pct(n.lai_thuc_thu / n.tn_lai_gop)} số lãi ghi nhận; phần chưa thu về khoảng ${ty(n.tn_lai_gop - n.lai_thuc_thu)}.`,
  B03: n => { const r = tl(n.no_nhom_2, n.cho_vay); return ok(r) && `Nợ cần chú ý ${ty(n.no_nhom_2)} bằng ${pct(r)} dư nợ: nếu toàn bộ chuyển thành nợ xấu, tỷ lệ nợ xấu tăng thêm khoảng ${dpt(r)}.`; },
  B04: n => ok(n.du_phong, n.no_xau) && `Dự phòng ${ty(n.du_phong)} bù được ${pct(n.du_phong / n.no_xau)} nợ xấu ${ty(n.no_xau)}; phần chưa được bù ${ty(n.no_xau - n.du_phong)}${ok(n.lnst) && n.lnst > 0 ? `, bằng ${pct((n.no_xau - n.du_phong) / n.lnst)} lợi nhuận sau thuế năm` : ''}.`,
  B05: n => ok(n.ts_co_khac, n.tts) && `Tài sản Có khác ${ty(n.ts_co_khac)}, bằng ${pct(n.ts_co_khac / n.tts)} tổng tài sản: cần biết bên trong gồm những khoản gì.`,
  B06: (n, t) => ok(n.cho_vay, t.cho_vay) && `Dư nợ tăng từ ${ty(t.cho_vay)} lên ${ty(n.cho_vay)} (${pct(n.cho_vay / t.cho_vay - 1)}) trong một năm.`,
  B07: (n, t) => ok(n.no_xau, t.no_xau, n.cho_vay) && `Nợ xấu tăng từ ${ty(t.no_xau)} lên ${ty(n.no_xau)}; tỷ lệ nợ xấu ${pct(n.no_xau / n.cho_vay)}.`,
  B08: n => ok(n.toi, n.nii) && n.toi > 0 && `${pct((n.toi - n.nii) / n.toi)} tổng thu nhập hoạt động (${ty(n.toi - n.nii)}) không đến từ cho vay.`,
  B09: (n, t) => { const r = tl(n.cp_du_phong, bq(n.cho_vay, t.cho_vay)); return ok(r, n.no_xau, t.no_xau) && `Nợ xấu tăng ${ty(n.no_xau - t.no_xau)} nhưng chi phí dự phòng chỉ bằng ${pct(r)} dư nợ bình quân.`; },
  B10: (n, t) => { const a = tl(n.casa, n.tien_gui), b = tl(t.casa, t.tien_gui); return ok(a, b) && `Tỷ trọng tiền gửi không kỳ hạn giảm ${dpt(b - a)} (từ ${pct(b)} xuống ${pct(a)}): nguồn vốn rẻ thu hẹp, chi phí vốn sẽ tăng.`; }
};

const CK = {
  C01: n => { const r = tl(n.margin, n.vcsh); return ok(r) && `Dư nợ ký quỹ ${ty(n.margin)} bằng ${pct(r)} vốn chủ: cứ 10% dư nợ không thu hồi được thì vốn chủ mất ${pct(0.1 * r)}.`; },
  C02: (n, t) => ok(n.margin, t.margin) && `Dư nợ ký quỹ tăng từ ${ty(t.margin)} lên ${ty(n.margin)} (${pct(n.margin / t.margin - 1)}) trong một năm.`,
  C03: n => ok(n.lai_fvtpl, n.dt_hd) && `${pct(n.lai_fvtpl / n.dt_hd)} doanh thu hoạt động (${ty(n.lai_fvtpl)}) đến từ lãi tự doanh – thay đổi theo thị trường.`,
  C04: n => ok(n.dg_rong, n.lntt) && n.lntt > 0 && `${pct(n.dg_rong / n.lntt)} lợi nhuận trước thuế (${ty(n.dg_rong)}) là lãi do chứng khoán đang giữ tăng giá, chưa bán ra thành tiền.`,
  C05: n => { const r = tl(n.fvtpl, n.vcsh); return ok(r) && `Danh mục tự doanh bằng ${pct(r)} vốn chủ: danh mục giảm 10% thì vốn chủ giảm ${pct(0.1 * r)}.`; },
  C06: n => { const r = tl(n.vay_nh, n.vcsh); return ok(r) && `Vay ngắn hạn ${ty(n.vay_nh)} bằng ${pct(r)} vốn chủ.`; },
  C07: (n, t) => ok(n.du_thu, t.du_thu) && `Lãi dự thu tăng từ ${ty(t.du_thu)} lên ${ty(n.du_thu)}: phần lãi đã ghi nhận nhưng chưa thu.`
};

const BANG = Object.assign({}, DN, NH, CK);
function suyLuan(id, n, t, t2, y) {
  const f = BANG[id];
  if (!f || !n || !t) return null;
  try { const s = f(n, t, t2, y); return typeof s === 'string' && s ? s : null; } catch (e) { return null; }
}
module.exports = { suyLuan };
