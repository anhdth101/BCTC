'use strict';
const SL = require('./suy_luan');
// Bộ quy tắc nghi vấn cho CÔNG TY CHỨNG KHOÁN: điều kiện cố định trên BCTC năm (mã trường Vietcap, đơn vị đồng).
// Dùng chung cho máy chủ và calib/5_backtest_ngan_hang.js --nhom=ck.

const so = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const tri = v => (v === null ? null : Math.abs(v));
const tl = (a, b) => (a === null || b === null || !(b > 0) ? null : a / b);
const tg = (a, b) => (a === null || b === null || !(b > 0) ? null : (a - b) / b);
const co = (...v) => v.every(x => x !== null && x !== undefined && Number.isFinite(x));

function soNam(d, y) {
  const tim = a => (a || []).find(r => r && +r.yearReport === y && (r.lengthReport === undefined || +r.lengthReport === 5 || +r.lengthReport === 4));
  const b = tim(d.bs), i = tim(d.is), c = tim(d.cf), n = tim(d.note);
  if (!b || !i) return null;
  const g = (o, k) => so(o && o[k]);
  const dgTang = g(i, 'iss117'), dgGiam = tri(g(i, 'iss126'));
  return {
    tts: g(b, 'bsa53'), vcsh: g(b, 'bsa78'), fvtpl: g(b, 'bsa6'), vay_nh: g(b, 'bsa56'),
    margin: g(b, 'bss215') !== null ? g(b, 'bss215') : g(n, 'nos446'), du_thu: g(b, 'bss219'),
    dt_hd: g(i, 'isa1'), dt_moi_gioi: g(i, 'iss42'), lai_fvtpl: g(i, 'iss115'), lai_margin: g(i, 'iss120'),
    dg_rong: dgTang !== null || dgGiam !== null ? (dgTang || 0) - (dgGiam || 0) : null,
    lntt: g(i, 'isa16'), lnst: g(i, 'isa20'), cfo: g(c, 'cfa18')
  };
}

const QUY_TAC_CK = [
  {
    id: 'C01', ten: 'Cho vay ký quỹ lớn so với vốn chủ',
    dien_giai: 'Công ty cho nhà đầu tư vay mua chứng khoán (ký quỹ) với dư nợ lớn so với vốn của chính mình – khi thị trường giảm mạnh, rủi ro mất vốn dồn về công ty.',
    dieu_kien: 'dư nợ cho vay ký quỹ / vốn chủ sở hữu > 150%',
    gia_thuyet: ['dư nợ ký quỹ tập trung vào một số mã hoặc nhóm khách hàng', 'tài sản đảm bảo là cổ phiếu thanh khoản thấp'],
    doi_chieu: ['thuyết minh cho vay ký quỹ: danh mục cổ phiếu cầm cố, mức tập trung', 'thuyết minh dự phòng các khoản cho vay', 'danh sách mã chứng khoán được cho vay ký quỹ của công ty'],
    tinh: n => { const r = tl(n.margin, n.vcsh); if (!co(r)) return null; return { kh: r > 1.5, bc: [['Dư nợ ký quỹ', n.margin, 'ty'], ['Vốn chủ', n.vcsh, 'ty'], ['Ký quỹ/vốn chủ', r, 'pct']] }; }
  },
  {
    id: 'C02', ten: 'Cho vay ký quỹ tăng nóng',
    dien_giai: 'Dư nợ cho vay ký quỹ tăng rất nhanh trong năm – công ty đang mở rộng cho vay, thường đi kèm hạ tiêu chuẩn tài sản đảm bảo.',
    dieu_kien: 'dư nợ cho vay ký quỹ tăng > 60% trong năm',
    gia_thuyet: ['mở rộng cho vay sang mã/khách hàng rủi ro hơn', 'tăng trưởng theo chu kỳ thị trường nóng'],
    doi_chieu: ['thuyết minh cho vay ký quỹ theo nhóm tài sản đảm bảo', 'tỷ lệ ký quỹ áp dụng cho các mã chính'],
    tinh: (n, t) => { const g = tg(n.margin, t.margin); if (!co(g)) return null; return { kh: g > 0.6, bc: [['Dư nợ ký quỹ năm trước', t.margin, 'ty'], ['Dư nợ ký quỹ năm nay', n.margin, 'ty'], ['Tăng trưởng', g, 'pct']] }; }
  },
  {
    id: 'C03', ten: 'Lợi nhuận dựa vào tự doanh',
    dien_giai: 'Phần lớn doanh thu đến từ lãi mua bán, nắm giữ chứng khoán của chính công ty (tự doanh) – loại thu nhập lên xuống theo thị trường.',
    dieu_kien: 'lãi từ tài sản tài chính ghi nhận qua lãi/lỗ (FVTPL) / doanh thu hoạt động > 50%',
    gia_thuyet: ['lợi nhuận phụ thuộc diễn biến thị trường, khó lặp lại', 'danh mục tự doanh tập trung vào ít mã'],
    doi_chieu: ['thuyết minh danh mục tài sản FVTPL: mã, giá trị gốc, giá trị hợp lý', 'thuyết minh lãi/lỗ bán tài sản tài chính'],
    tinh: n => { const r = tl(n.lai_fvtpl, n.dt_hd); if (!co(r)) return null; return { kh: r > 0.5, bc: [['Lãi tài sản FVTPL', n.lai_fvtpl, 'ty'], ['Doanh thu hoạt động', n.dt_hd, 'ty'], ['Tỷ trọng tự doanh', r, 'pct']] }; }
  },
  {
    id: 'C04', ten: 'Lãi đánh giá lại chiếm phần lớn lợi nhuận',
    dien_giai: 'Một phần lớn lợi nhuận là lãi "trên giấy" do chứng khoán đang nắm giữ tăng giá, chưa bán ra thành tiền.',
    dieu_kien: 'chênh lệch đánh giá lại tài sản FVTPL (tăng − giảm) / lợi nhuận trước thuế > 30%',
    gia_thuyet: ['lợi nhuận có thể đảo chiều khi giá chứng khoán giảm', 'định giá cổ phiếu thanh khoản thấp theo giá tham chiếu'],
    doi_chieu: ['thuyết minh danh mục FVTPL và phương pháp xác định giá trị hợp lý', 'giá thị trường hiện tại của các mã lớn trong danh mục'],
    tinh: n => { const r = n.lntt > 0 && co(n.dg_rong) ? n.dg_rong / n.lntt : null; if (!co(r)) return null; return { kh: r > 0.3, bc: [['Chênh lệch đánh giá lại ròng', n.dg_rong, 'ty'], ['Lợi nhuận trước thuế', n.lntt, 'ty'], ['Tỷ trọng', r, 'pct']] }; }
  },
  {
    id: 'C05', ten: 'Danh mục tự doanh lớn so với vốn chủ',
    dien_giai: 'Công ty nắm giữ lượng chứng khoán tự doanh lớn hơn nhiều so với vốn của mình – thị trường giảm thì vốn chủ bị ăn mòn nhanh.',
    dieu_kien: 'tài sản FVTPL / vốn chủ sở hữu > 150%',
    gia_thuyet: ['đòn bẩy tự doanh cao, nhạy với biến động thị trường', 'danh mục gồm nhiều trái phiếu doanh nghiệp/chứng chỉ tiền gửi để nắm giữ ngắn hạn'],
    doi_chieu: ['thuyết minh cơ cấu danh mục FVTPL (cổ phiếu, trái phiếu, chứng chỉ tiền gửi)', 'thuyết minh trái phiếu doanh nghiệp nắm giữ: tổ chức phát hành, tài sản đảm bảo'],
    tinh: n => { const r = tl(n.fvtpl, n.vcsh); if (!co(r)) return null; return { kh: r > 1.5, bc: [['Tài sản FVTPL', n.fvtpl, 'ty'], ['Vốn chủ', n.vcsh, 'ty'], ['FVTPL/vốn chủ', r, 'pct']] }; }
  },
  {
    id: 'C06', ten: 'Vay ngắn hạn lớn so với vốn chủ',
    dien_giai: 'Công ty dựa nhiều vào vốn vay ngắn hạn để cho vay ký quỹ và tự doanh – áp lực trả nợ lớn khi thị trường đảo chiều.',
    dieu_kien: 'vay ngắn hạn / vốn chủ sở hữu > 150%',
    gia_thuyet: ['đòn bẩy cao, phụ thuộc hạn mức ngân hàng', 'chênh lệch kỳ hạn giữa vốn vay và tài sản'],
    doi_chieu: ['thuyết minh vay: bên cho vay, kỳ hạn, tài sản đảm bảo', 'chỉ tiêu an toàn tài chính công ty công bố định kỳ'],
    tinh: n => { const r = tl(n.vay_nh, n.vcsh); if (!co(r)) return null; return { kh: r > 1.5, bc: [['Vay ngắn hạn', n.vay_nh, 'ty'], ['Vốn chủ', n.vcsh, 'ty'], ['Vay/vốn chủ', r, 'pct']] }; }
  },
  {
    id: 'C07', ten: 'Lãi dự thu tăng nhanh hơn dư nợ',
    dien_giai: 'Tiền lãi công ty ghi nhận nhưng chưa thu được tăng nhanh hơn hẳn dư nợ cho vay – lãi trên sổ nhiều hơn lãi thực thu.',
    dieu_kien: 'tăng trưởng phải thu dự thu − tăng trưởng dư nợ ký quỹ > 30 điểm %',
    gia_thuyet: ['khoản cho vay hoặc trái phiếu nắm giữ chậm trả lãi', 'lãi dự thu của khoản đầu tư khó thu hồi'],
    doi_chieu: ['thuyết minh phải thu và dự thu cổ tức, tiền lãi', 'thuyết minh trái phiếu doanh nghiệp nắm giữ'],
    tinh: (n, t) => { const a = tg(n.du_thu, t.du_thu), b = tg(n.margin, t.margin); if (!co(a, b)) return null; return { kh: a - b > 0.3, bc: [['Tăng trưởng dự thu', a, 'pct'], ['Tăng trưởng dư nợ ký quỹ', b, 'pct'], ['Dự thu cuối năm', n.du_thu, 'ty']] }; }
  }
];

function danhGia(d, y) {
  const n = soNam(d, y), t = soNam(d, y - 1), t2 = soNam(d, y - 2);
  return QUY_TAC_CK.map(q => {
    let r = null;
    if (n && t) { try { r = q.tinh(n, t, y); } catch (e) { r = null; } }
    return { id: q.id, kich_hoat: r ? !!r.kh : null, bang_chung: r ? r.bc.filter(x => x[1] !== null && Number.isFinite(x[1])) : [], suy_luan: r && r.kh ? SL.suyLuan(q.id, n, t, t2, y) : null };
  });
}

// Nhãn xấu cho năm y: năm y+1 lợi nhuận sau thuế giảm từ 30% trở lên hoặc chuyển lỗ.
function nhan(d, y) {
  const n = soNam(d, y), m = soNam(d, y + 1);
  if (!n || !m || !co(n.lnst, m.lnst) || !(n.lnst > 0)) return null;
  return { xau: m.lnst <= 0.7 * n.lnst, lnst_giam: m.lnst <= 0.7 * n.lnst, npl_tang: null };
}

module.exports = { QUY_TAC: QUY_TAC_CK, danhGia, nhan, soNam,
  NHAN: 'năm sau lợi nhuận sau thuế giảm từ 30% trở lên hoặc chuyển sang lỗ',
  KQ_XAU: 'có lợi nhuận giảm từ 30% trở lên hoặc chuyển lỗ vào năm kế tiếp', DON_VI: 'công ty chứng khoán–năm' };
