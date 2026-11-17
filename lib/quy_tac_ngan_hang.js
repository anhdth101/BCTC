'use strict';
const SL = require('./suy_luan');
// Bộ quy tắc nghi vấn cho NGÂN HÀNG: điều kiện cố định trên BCTC năm (mã trường Vietcap, đơn vị đồng; nợ xấu lấy từ thuyết minh NOTE).
// Dùng chung cho máy chủ và calib/5_backtest_ngan_hang.js.

const so = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const tri = v => (v === null ? null : Math.abs(v));
const tl = (a, b) => (a === null || b === null || !(b > 0) ? null : a / b);
const tg = (a, b) => (a === null || b === null || !(b > 0) ? null : (a - b) / b);
const bq = (a, b) => (a === null ? b : b === null ? a : (a + b) / 2);
const co = (...v) => v.every(x => x !== null && x !== undefined && Number.isFinite(x));

function soNam(d, y) {
  const tim = a => (a || []).find(r => r && +r.yearReport === y && (r.lengthReport === undefined || +r.lengthReport === 5 || +r.lengthReport === 4));
  const b = tim(d.bs), i = tim(d.is), c = tim(d.cf), n = tim(d.note);
  if (!b || !i) return null;
  const g = (o, k) => so(o && o[k]);
  const n3 = g(n, 'nob42'), n4 = g(n, 'nob43'), n5 = g(n, 'nob44');
  return {
    tts: g(b, 'bsa53'), cho_vay: g(b, 'bsb104'), du_phong: tri(g(b, 'bsb105')), tien_gui: g(b, 'bsb113'), lai_phai_thu: g(b, 'bsb265'), ts_co_khac: g(b, 'bsb110'),
    casa: g(n, 'nob66'), no_nhom_2: g(n, 'nob41'), no_xau: co(n3, n4, n5) ? n3 + n4 + n5 : null,
    tn_lai_gop: g(i, 'isb25'), nii: g(i, 'isb27'), toi: g(i, 'isb38'), cp_du_phong: tri(g(i, 'isb41')), lnst: g(i, 'isa20'),
    lai_thuc_thu: g(c, 'cfb75')
  };
}

const QUY_TAC_NH = [
  {
    id: 'B01', ten: 'Lãi phải thu tăng nhanh hơn cho vay',
    dieu_kien: 'tăng trưởng lãi, phí phải thu − tăng trưởng cho vay khách hàng > 20 điểm % và lãi phải thu > 1% dư nợ',
    gia_thuyet: ['lãi được ghi nhận dồn tích nhưng khách hàng chưa trả (khoản vay khó trả, gia hạn, cơ cấu lại)', 'ghi nhận lãi của khoản vay lẽ ra phải chuyển nhóm'],
    doi_chieu: ['thuyết minh lãi, phí phải thu theo kỳ hạn', 'thuyết minh nợ cơ cấu lại, giữ nguyên nhóm nợ', 'báo cáo kiểm toán: các vấn đề trọng yếu về phân loại nợ'],
    tinh: (n, t) => { const a = tg(n.lai_phai_thu, t.lai_phai_thu), b = tg(n.cho_vay, t.cho_vay), r = tl(n.lai_phai_thu, n.cho_vay); if (!co(a, b, r)) return null;
      return { kh: a - b > 0.2 && r > 0.01, bc: [['Tăng trưởng lãi phải thu', a, 'pct'], ['Tăng trưởng cho vay', b, 'pct'], ['Lãi phải thu/cho vay', r, 'pct']] }; }
  },
  {
    id: 'B02', ten: 'Tiền lãi thực thu thấp so với thu nhập lãi',
    dieu_kien: 'tiền thu lãi và phí (LCTT) / thu nhập lãi và tương tự (KQKD) < 90%',
    gia_thuyet: ['lãi ghi nhận trên sổ chưa thu được tiền', 'khách hàng vay mới để trả lãi cũ'],
    doi_chieu: ['thuyết minh lãi, phí phải thu', 'thuyết minh nợ cơ cấu lại', 'chính sách ghi nhận thu nhập lãi'],
    tinh: n => { const r = tl(n.lai_thuc_thu, n.tn_lai_gop); if (!co(r)) return null;
      return { kh: r < 0.9, bc: [['Tiền lãi thực thu', n.lai_thuc_thu, 'ty'], ['Thu nhập lãi', n.tn_lai_gop, 'ty'], ['Tỷ lệ thực thu', r, 'pct']] }; }
  },
  {
    id: 'B03', ten: 'Nợ nhóm 2 cao hoặc tăng mạnh',
    dieu_kien: 'nợ cần chú ý (nhóm 2) > 2% dư nợ, hoặc tăng > 50% trong năm',
    gia_thuyet: ['nợ đang xấu đi nhưng chưa chuyển sang nợ xấu', 'nợ xấu tương lai đang tích tụ'],
    doi_chieu: ['thuyết minh phân loại nợ theo nhóm', 'thuyết minh nợ cơ cấu lại', 'BCTC quý kế tiếp: nợ nhóm 3–5'],
    tinh: (n, t) => { const r = tl(n.no_nhom_2, n.cho_vay), g = tg(n.no_nhom_2, t.no_nhom_2); if (!co(r)) return null;
      return { kh: r > 0.02 || (g !== null && g > 0.5), bc: [['Nợ nhóm 2', n.no_nhom_2, 'ty'], ['Nợ nhóm 2/cho vay', r, 'pct'], ['Tăng trưởng nợ nhóm 2', g, 'pct']] }; }
  },
  {
    id: 'B04', ten: 'Dự phòng mỏng so với nợ xấu',
    dieu_kien: 'dự phòng rủi ro cho vay / nợ xấu (nhóm 3–5) < 70%',
    gia_thuyet: ['trích lập chưa đủ, lợi nhuận đang được giữ cao', 'phụ thuộc tài sản đảm bảo để giảm trích lập'],
    doi_chieu: ['thuyết minh dự phòng rủi ro tín dụng', 'thuyết minh tài sản đảm bảo', 'báo cáo kiểm toán về dự phòng'],
    tinh: n => { const r = tl(n.du_phong, n.no_xau); if (!co(r)) return null;
      return { kh: r < 0.7, bc: [['Dự phòng cho vay', n.du_phong, 'ty'], ['Nợ xấu nhóm 3–5', n.no_xau, 'ty'], ['Bao phủ nợ xấu', r, 'pct']] }; }
  },
  {
    id: 'B05', ten: 'Tài sản Có khác phình to',
    dieu_kien: 'tài sản Có khác > 5% tổng tài sản, hoặc > 3% và tăng > 50% trong năm',
    gia_thuyet: ['tài sản xử lý nợ, khoản ứng trước hoặc phải thu chưa phân loại vào cho vay', 'khoản phải thu từ bán nợ/bán tài sản chưa thu tiền'],
    doi_chieu: ['thuyết minh tài sản Có khác: thành phần, đối tượng', 'thuyết minh tài sản gán nợ đã chuyển quyền sở hữu', 'thuyết minh giao dịch bên liên quan'],
    tinh: (n, t) => { const r = tl(n.ts_co_khac, n.tts), g = tg(n.ts_co_khac, t.ts_co_khac); if (!co(r)) return null;
      return { kh: r > 0.05 || (r > 0.03 && g !== null && g > 0.5), bc: [['Tài sản Có khác', n.ts_co_khac, 'ty'], ['Tài sản Có khác/TTS', r, 'pct'], ['Tăng trưởng', g, 'pct']] }; }
  },
  {
    id: 'B06', ten: 'Cho vay tăng nóng',
    dieu_kien: 'cho vay khách hàng tăng > 25% trong năm',
    gia_thuyet: ['mở rộng sang phân khúc rủi ro cao', 'tăng trưởng tập trung vào một nhóm khách hàng/ngành'],
    doi_chieu: ['thuyết minh cho vay theo ngành, theo đối tượng', 'thuyết minh tập trung tín dụng', 'hạn mức tăng trưởng tín dụng được NHNN giao'],
    tinh: (n, t) => { const g = tg(n.cho_vay, t.cho_vay); if (!co(g)) return null; return { kh: g > 0.25, bc: [['Tăng trưởng cho vay', g, 'pct']] }; }
  },
  {
    id: 'B07', ten: 'Nợ xấu tăng nhanh',
    dieu_kien: 'nợ xấu (nhóm 3–5) tăng > 30% trong năm và nợ xấu > 1% dư nợ',
    gia_thuyet: ['chất lượng tài sản đang xấu đi', 'nợ cơ cấu lại hết hạn giữ nhóm'],
    doi_chieu: ['thuyết minh phân loại nợ', 'thuyết minh nợ cơ cấu lại', 'BCTC quý kế tiếp'],
    tinh: (n, t) => { const g = tg(n.no_xau, t.no_xau), r = tl(n.no_xau, n.cho_vay); if (!co(g, r)) return null;
      return { kh: g > 0.3 && r > 0.01, bc: [['Nợ xấu năm trước', t.no_xau, 'ty'], ['Nợ xấu năm nay', n.no_xau, 'ty'], ['Tỷ lệ nợ xấu', r, 'pct']] }; }
  },
  {
    id: 'B08', ten: 'Lợi nhuận dựa vào thu nhập ngoài lãi',
    dieu_kien: '(tổng thu nhập hoạt động − thu nhập lãi thuần) / tổng thu nhập hoạt động > 35%',
    gia_thuyet: ['lãi một lần từ bán vốn, bán bảo hiểm độc quyền, mua bán chứng khoán', 'thu nhập khó lặp lại'],
    doi_chieu: ['thuyết minh thu nhập ngoài lãi theo nguồn', 'hợp đồng phân phối bảo hiểm/thoái vốn', 'thuyết minh lãi/lỗ chứng khoán'],
    tinh: n => { const r = n.toi > 0 && co(n.nii) ? (n.toi - n.nii) / n.toi : null; if (!co(r)) return null;
      return { kh: r > 0.35, bc: [['Tổng thu nhập hoạt động', n.toi, 'ty'], ['Thu nhập lãi thuần', n.nii, 'ty'], ['Tỷ trọng ngoài lãi', r, 'pct']] }; }
  },
  {
    id: 'B09', ten: 'Trích lập thấp trong khi nợ xấu tăng',
    dieu_kien: 'chi phí dự phòng / cho vay bình quân < 0,8% trong khi nợ xấu tăng',
    gia_thuyet: ['giữ lợi nhuận bằng cách hoãn trích lập', 'nợ xấu được kỳ vọng xử lý bằng tài sản đảm bảo'],
    doi_chieu: ['thuyết minh dự phòng rủi ro tín dụng', 'thuyết minh tài sản đảm bảo', 'báo cáo kiểm toán về dự phòng'],
    tinh: (n, t) => { const cb = bq(n.cho_vay, t.cho_vay), r = tl(n.cp_du_phong, cb); if (!co(r, n.no_xau, t.no_xau)) return null;
      return { kh: r < 0.008 && n.no_xau > t.no_xau, bc: [['Chi phí dự phòng', n.cp_du_phong, 'ty'], ['Chi phí dự phòng/cho vay bình quân', r, 'pct'], ['Nợ xấu năm trước', t.no_xau, 'ty'], ['Nợ xấu năm nay', n.no_xau, 'ty']] }; }
  },
  {
    id: 'B10', ten: 'Tiền gửi không kỳ hạn giảm tỷ trọng',
    dieu_kien: 'tiền gửi không kỳ hạn / tiền gửi khách hàng giảm > 3 điểm % trong năm',
    gia_thuyet: ['chi phí vốn sắp tăng, biên lãi bị ép', 'khách hàng rút tiền thanh toán'],
    doi_chieu: ['thuyết minh tiền gửi khách hàng theo kỳ hạn', 'biên lãi thuần các quý kế tiếp'],
    tinh: (n, t) => { const a = tl(n.casa, n.tien_gui), b = tl(t.casa, t.tien_gui); if (!co(a, b)) return null;
      return { kh: b - a > 0.03, bc: [['Tỷ trọng không kỳ hạn năm trước', b, 'pct'], ['Tỷ trọng không kỳ hạn năm nay', a, 'pct']] }; }
  }
];

const DIEN_GIAI = {
  B01: 'Tiền lãi ngân hàng ghi nhận nhưng khách chưa trả tăng nhanh hơn hẳn dư nợ cho vay – lãi trên sổ nhiều hơn lãi thực thu.',
  B02: 'Tiền lãi thực thu về thấp hơn đáng kể so với thu nhập lãi ghi nhận.',
  B03: 'Khoản vay "cần chú ý" (đã trễ hạn nhưng chưa thành nợ xấu) chiếm tỷ lệ cao hoặc tăng mạnh – nợ xấu tương lai đang tích tụ.',
  B04: 'Quỹ dự phòng để bù đắp nợ xấu chưa đủ bao phủ khoản nợ xấu hiện có.',
  B05: 'Nhóm "tài sản khác" (không phải cho vay hay đầu tư) phình to trong bảng cân đối – cần biết bên trong là gì.',
  B06: 'Dư nợ cho vay tăng rất nhanh trong năm, nhanh hơn mức tăng thông thường của ngành.',
  B07: 'Nợ xấu tăng mạnh so với năm trước.',
  B08: 'Một phần lớn thu nhập đến từ hoạt động ngoài cho vay (phí, bảo hiểm, mua bán chứng khoán) – loại thu nhập dễ biến động.',
  B09: 'Nợ xấu tăng nhưng chi phí trích lập dự phòng lại thấp – lợi nhuận có thể đang được giữ cao nhờ trích lập ít.',
  B10: 'Tỷ trọng tiền gửi không kỳ hạn (nguồn vốn rẻ) giảm – chi phí vốn của ngân hàng sắp tăng.'
};
QUY_TAC_NH.forEach(q => { q.dien_giai = DIEN_GIAI[q.id]; });

function danhGiaQuyTacNH(d, y) {
  const n = soNam(d, y), t = soNam(d, y - 1), t2 = soNam(d, y - 2);
  return QUY_TAC_NH.map(q => {
    let r = null;
    if (n && t) { try { r = q.tinh(n, t, y); } catch (e) { r = null; } }
    return { id: q.id, kich_hoat: r ? !!r.kh : null, bang_chung: r ? r.bc.filter(x => x[1] !== null && Number.isFinite(x[1])) : [], suy_luan: r && r.kh ? SL.suyLuan(q.id, n, t, t2, y) : null };
  });
}

// Nhãn xấu cho năm y: kết quả năm y+1.
function nhanNH(d, y) {
  const n = soNam(d, y), m = soNam(d, y + 1);
  if (!n || !m) return null;
  const r0 = tl(n.no_xau, n.cho_vay), r1 = tl(m.no_xau, m.cho_vay);
  const npl = co(r0, r1) ? r1 - r0 >= 0.005 : null;
  const ln = co(n.lnst, m.lnst) && n.lnst > 0 ? m.lnst <= 0.7 * n.lnst : null;
  const dp = co(n.cp_du_phong, m.cp_du_phong) && n.cp_du_phong > 0 ? m.cp_du_phong >= 1.5 * n.cp_du_phong : null;
  if (npl === null && ln === null) return null;
  return { xau: !!(npl || ln), npl_tang: npl, lnst_giam: ln, du_phong_tang: dp };
}

const NHAN = 'năm sau tỷ lệ nợ xấu (nhóm 3–5) tăng thêm từ 0,5 điểm % trở lên hoặc lợi nhuận sau thuế giảm từ 30% trở lên';
const KQ_XAU = 'có nợ xấu tăng mạnh hoặc lợi nhuận giảm từ 30% trở lên vào năm kế tiếp';
module.exports = { QUY_TAC_NH, danhGiaQuyTacNH, nhanNH, soNamNH: soNam,
  QUY_TAC: QUY_TAC_NH, danhGia: danhGiaQuyTacNH, nhan: nhanNH, soNam, NHAN, KQ_XAU, DON_VI: 'ngân hàng–năm' };
