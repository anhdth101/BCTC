'use strict';
const SL = require('./suy_luan');
// Bộ quy tắc nghi vấn BCTC: điều kiện cố định, tính trên BCTC năm (mã trường Vietcap, đơn vị đồng).
// Dùng chung cho máy chủ (api/analyze.js) và bộ kiểm chứng ngược (calib/4_backtest_quy_tac.js):
// AI chỉ được bình luận các quy tắc đã kích hoạt ở đây, không tự đặt ra nghi vấn mới.

const so = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const tri = v => (v === null ? null : Math.abs(v));
const tl = (a, b) => (a === null || b === null || !(b > 0) ? null : a / b);
const tg = (a, b) => (a === null || b === null || !(b > 0) ? null : (a - b) / b);
const bq = (a, b) => (a === null ? b : b === null ? a : (a + b) / 2);
const cong = (...v) => (v.every(x => x === null) ? null : v.reduce((s, x) => s + (x || 0), 0));
const co = (...v) => v.every(x => x !== null && x !== undefined);

function soNam(d, y) {
  const tim = a => (a || []).find(r => r && +r.yearReport === y && (r.lengthReport === undefined || +r.lengthReport === 5 || +r.lengthReport === 4));
  const b = tim(d.bs), i = tim(d.is), c = tim(d.cf);
  if (!b || !i) return null;
  const g = (o, ...ks) => { for (const k of ks) { const v = so(o && o[k]); if (v !== null) return v; } return null; };
  const vnh = g(b, 'bsa56'), vdh = g(b, 'bsa71');
  return {
    tts: g(b, 'bsa53'), tien: g(b, 'bsa2'), dttc_nh: g(b, 'bsa5'), pt_nh: g(b, 'bsa8'), pt_kh: g(b, 'bsa9'), tra_truoc: g(b, 'bsa10'),
    pt_cho_vay: g(b, 'bsa159'), pt_khac: g(b, 'bsa13'), ton_kho: g(b, 'bsa16'), pt_dh: g(b, 'bsa24'), pt_khac_dh: g(b, 'bsa27'),
    dttc_dh: g(b, 'bsa43'), xdcb: g(b, 'bsa188', 'bsa39'), gw: g(b, 'bsa209', 'bsa48'), vay: cong(vnh, vdh), vcsh: g(b, 'bsa78'), cdkks: g(b, 'bsa210', 'bsa95'),
    von_gop: g(b, 'bsa80'), lncpp: g(b, 'bsa90'),
    dt: g(i, 'isa3'), gv: tri(g(i, 'isa4')), ln_gop: g(i, 'isa5'), dttc: g(i, 'isa6'), lai_vay: tri(g(i, 'isa8')), cpbh: tri(g(i, 'isa9')), cpql: tri(g(i, 'isa10')),
    lntt: g(i, 'isa16'), lnst: g(i, 'isa20'), ln_cdkks: g(i, 'isa21'),
    cfo: g(c, 'cfa18'), cff: g(c, 'cfa34'), lai_da_tra: tri(g(c, 'cfa14')), capex: tri(g(c, 'cfa19')), chi_cho_vay: tri(g(c, 'cfa21')), chi_gop_von: tri(g(c, 'cfa23'))
  };
}

// kieu: ty (đồng → tỷ đồng), pct (tỷ lệ → %), ngay, lan.
// tinh(n, t, t2, y) → null khi thiếu dữ liệu; { kh: true|false, bc: [[nhãn, giá trị, kiểu], ...] }.
const QUY_TAC = [
  {
    id: 'R01', ten: 'Lãi trên sổ, tiền không về',
    dieu_kien: 'LNST dương 2 năm liền nhưng tổng lưu chuyển tiền thuần từ HĐKD 2 năm đó âm',
    gia_thuyet: ['doanh thu ghi nhận trước khi thu được tiền (bán chịu, bán cho bên liên quan, ghi nhận theo tiến độ)', 'tiền bị giữ trong tồn kho hoặc dự án dở dang chưa bàn giao', 'lợi nhuận đến từ khoản phi tiền tệ (đánh giá lại, lãi công ty liên kết, thanh lý ghi nhận phải thu)'],
    doi_chieu: ['thuyết minh phải thu khách hàng: khách hàng lớn, tuổi nợ, bên liên quan', 'thuyết minh doanh thu và chính sách ghi nhận doanh thu', 'thuyết minh giao dịch với bên liên quan', 'chi tiết biến động vốn lưu động trên báo cáo lưu chuyển tiền tệ'],
    tinh: (n, t, t2, y) => (co(n.lnst, t.lnst, n.cfo, t.cfo) ? { kh: n.lnst > 0 && t.lnst > 0 && n.cfo + t.cfo < 0,
      bc: [[`LNST ${y - 1}`, t.lnst, 'ty'], [`LNST ${y}`, n.lnst, 'ty'], [`CFO ${y - 1}`, t.cfo, 'ty'], [`CFO ${y}`, n.cfo, 'ty']] } : null)
  },
  {
    id: 'R02', ten: 'Lợi nhuận dồn tích cao',
    dieu_kien: '(LNST − CFO) / tổng tài sản bình quân > 10% khi LNST dương',
    gia_thuyet: ['lợi nhuận phụ thuộc ước tính kế toán (dự phòng, khấu hao, ghi nhận theo tiến độ)', 'vốn lưu động (phải thu, tồn kho) phình ra để đẩy lợi nhuận'],
    doi_chieu: ['thuyết minh dự phòng phải thu khó đòi và giảm giá tồn kho', 'thay đổi chính sách khấu hao và ước tính kế toán', 'các vấn đề kiểm toán trọng yếu trong báo cáo kiểm toán'],
    tinh: (n, t) => {
      const tb = bq(n.tts, t.tts);
      if (!co(n.lnst, n.cfo) || !(tb > 0)) return null;
      const a = (n.lnst - n.cfo) / tb;
      return { kh: n.lnst > 0 && a > 0.10, bc: [['LNST', n.lnst, 'ty'], ['CFO', n.cfo, 'ty'], ['(LNST − CFO)/TTS bình quân', a, 'pct']] };
    }
  },
  {
    id: 'R03', ten: 'Phải thu khách hàng tăng nhanh hơn doanh thu',
    dieu_kien: 'tăng trưởng phải thu khách hàng ngắn hạn − tăng trưởng doanh thu thuần > 30 điểm % và phải thu khách hàng > 5% tổng tài sản',
    gia_thuyet: ['nới thời hạn bán chịu để giữ doanh số', 'doanh thu ghi nhận với khách hàng khó thu hoặc bên liên quan', 'doanh thu ghi nhận sớm hoặc khống vào cuối kỳ'],
    doi_chieu: ['thuyết minh phải thu: khách hàng lớn, tuổi nợ, bên liên quan', 'doanh thu quý 4 so với các quý trước (BCTC quý)', 'phải thu có được thu hồi ở quý sau không (BCTC quý kế tiếp)', 'ý kiến kiểm toán về phải thu'],
    tinh: (n, t) => {
      const gp = tg(n.pt_kh, t.pt_kh), gd = tg(n.dt, t.dt), r = tl(n.pt_kh, n.tts);
      if (!co(gp, gd, r)) return null;
      return { kh: gp - gd > 0.30 && r > 0.05, bc: [['Tăng trưởng phải thu khách hàng', gp, 'pct'], ['Tăng trưởng doanh thu thuần', gd, 'pct'], ['Phải thu khách hàng/TTS', r, 'pct']] };
    }
  },
  {
    id: 'R04', ten: 'Tồn kho tăng nhanh hơn giá vốn',
    dieu_kien: 'tăng trưởng hàng tồn kho − tăng trưởng giá vốn > 30 điểm % và tồn kho > 10% tổng tài sản',
    gia_thuyet: ['hàng chậm bán, chưa trích đủ dự phòng giảm giá', 'chi phí được vốn hoá vào tồn kho làm giảm giá vốn', 'tồn kho là dự án bất động sản dở dang kéo dài'],
    doi_chieu: ['thuyết minh hàng tồn kho: cơ cấu, dự phòng, hàng đem thế chấp', 'ý kiến kiểm toán về kiểm kê tồn kho', 'giá bán thị trường của mặt hàng/dự án chính'],
    tinh: (n, t) => {
      const gk = tg(n.ton_kho, t.ton_kho), gg = tg(n.gv, t.gv), r = tl(n.ton_kho, n.tts);
      if (!co(gk, gg, r)) return null;
      return { kh: gk - gg > 0.30 && r > 0.10, bc: [['Tăng trưởng hàng tồn kho', gk, 'pct'], ['Tăng trưởng giá vốn', gg, 'pct'], ['Tồn kho/TTS', r, 'pct']] };
    }
  },
  {
    id: 'R05', ten: 'Tiền đi ra qua trả trước, cho vay, phải thu khác',
    dieu_kien: '(trả trước người bán + phải thu về cho vay + phải thu khác ngắn và dài hạn) > 20% tổng tài sản, hoặc > 10% và tăng trên 50% trong năm',
    gia_thuyet: ['chuyển tiền cho bên liên quan dưới danh nghĩa tạm ứng, đặt cọc, hợp tác đầu tư', 'trả trước cho dự án hoặc thương vụ M&A chưa hoàn tất', 'cho vay doanh nghiệp/cá nhân không có tài sản đảm bảo'],
    doi_chieu: ['thuyết minh phải thu khác và trả trước người bán: đối tượng, nội dung, thời hạn', 'thuyết minh số dư với bên liên quan', 'nghị quyết HĐQT về hợp tác đầu tư, đặt cọc, cho vay', 'hợp đồng và tài sản đảm bảo của khoản cho vay'],
    tinh: (n, t) => {
      const s = cong(n.tra_truoc, n.pt_cho_vay, n.pt_khac, n.pt_khac_dh), s0 = cong(t.tra_truoc, t.pt_cho_vay, t.pt_khac, t.pt_khac_dh), r = tl(s, n.tts);
      if (!co(s, r)) return null;
      const g = tg(s, s0);
      return { kh: r > 0.20 || (r > 0.10 && g !== null && g > 0.5), bc: [['Trả trước + cho vay + phải thu khác', s, 'ty'], ['Tỷ trọng/TTS', r, 'pct'], ['Tăng trưởng trong năm', g, 'pct']] };
    }
  },
  {
    id: 'R06', ten: 'Lợi nhuận không đến từ kinh doanh cốt lõi',
    dieu_kien: 'LNTT dương nhưng lợi nhuận cốt lõi (LN gộp − chi phí bán hàng − chi phí quản lý) ≤ 0, hoặc phần ngoài cốt lõi > 50% LNTT',
    gia_thuyet: ['lãi từ thoái vốn, thanh lý tài sản, đánh giá lại – không lặp lại', 'lãi từ công ty liên kết hoặc thu nhập tài chính từ bên liên quan', 'khoản lãi một lần che lỗ mảng kinh doanh chính'],
    doi_chieu: ['thuyết minh doanh thu tài chính và thu nhập khác', 'nghị quyết HĐQT về chuyển nhượng vốn/tài sản và bên nhận chuyển nhượng', 'báo cáo bộ phận theo mảng'],
    tinh: n => {
      if (!co(n.lntt, n.ln_gop) || !(n.lntt > 0)) return co(n.lntt) ? { kh: false, bc: [] } : null;
      const core = n.ln_gop - (n.cpbh || 0) - (n.cpql || 0), ngoai = (n.lntt - core) / n.lntt;
      return { kh: core <= 0 || ngoai > 0.5, bc: [['LNTT', n.lntt, 'ty'], ['Lợi nhuận cốt lõi', core, 'ty'], ['Phần ngoài cốt lõi/LNTT', ngoai, 'pct']] };
    }
  },
  {
    id: 'R07', ten: 'Lợi thế thương mại biến động mạnh',
    dieu_kien: 'lợi thế thương mại đầu năm > 2% vốn chủ và thay đổi > 50% trong năm, hoặc cuối năm > 5% vốn chủ và tăng gấp đôi',
    gia_thuyet: ['thoái vốn công ty con (lợi thế thương mại bị loại khỏi hợp nhất)', 'ghi giảm do công ty con suy giảm giá trị', 'thương vụ M&A mới trả giá cao hơn giá trị sổ sách, có thể mua tài sản của bên liên quan'],
    doi_chieu: ['thuyết minh lợi thế thương mại và hợp nhất kinh doanh', 'nghị quyết HĐQT về mua/bán công ty con', 'BCTC của công ty con liên quan', 'đối tác mua/bán trong thương vụ có phải bên liên quan không'],
    tinh: (n, t) => {
      const g1 = n.gw || 0, g0 = t.gw || 0;
      if (!co(n.vcsh, t.vcsh) || (!g1 && !g0)) return co(n.vcsh) ? { kh: false, bc: [] } : null;
      const r0 = tl(g0, t.vcsh), r1 = tl(g1, n.vcsh);
      const kh = (r0 !== null && r0 > 0.02 && Math.abs(g1 - g0) / g0 > 0.5) || (r1 !== null && r1 > 0.05 && g0 < g1 * 0.5);
      return { kh, bc: [['Lợi thế thương mại đầu năm', g0, 'ty'], ['Lợi thế thương mại cuối năm', g1, 'ty'], ['Cuối năm/vốn chủ', r1, 'pct']] };
    }
  },
  {
    id: 'R08', ten: 'Chi phí lãi vay thấp bất thường so với nợ vay',
    dieu_kien: 'vay bình quân > 20% tổng tài sản và (chi phí lãi vay/vay bình quân < 3%/năm, hoặc lãi vay thực trả > 1,3 lần chi phí lãi vay)',
    gia_thuyet: ['lãi vay được vốn hoá vào dự án/tồn kho, làm lợi nhuận đẹp hơn', 'vay từ bên liên quan với lãi suất ưu đãi hoặc không lãi', 'nợ vay tăng mạnh sát cuối kỳ nên số dư không đại diện'],
    doi_chieu: ['thuyết minh vay: bên cho vay, lãi suất, tài sản đảm bảo', 'thuyết minh chi phí đi vay được vốn hoá', 'thuyết minh XDCB dở dang và tồn kho dự án'],
    tinh: (n, t) => {
      const vb = bq(n.vay, t.vay);
      if (!co(vb, n.lai_vay, n.tts) || !(vb > 0)) return co(n.tts) ? { kh: false, bc: [] } : null;
      const ls = n.lai_vay / vb, tra = n.lai_vay > 0 && n.lai_da_tra !== null ? n.lai_da_tra / n.lai_vay : null;
      return { kh: vb / n.tts > 0.2 && (ls < 0.03 || (tra !== null && tra > 1.3)),
        bc: [['Vay bình quân', vb, 'ty'], ['Chi phí lãi vay', n.lai_vay, 'ty'], ['Lãi suất ngầm định', ls, 'pct'], ['Lãi vay thực trả/chi phí lãi vay', tra, 'lan']] };
    }
  },
  {
    id: 'R09', ten: 'Vừa nhiều tiền vừa vay nhiều',
    dieu_kien: 'tiền + đầu tư tài chính ngắn hạn > 15% tổng tài sản, vay > 25% tổng tài sản và doanh thu tài chính/tiền bình quân < 2%/năm',
    gia_thuyet: ['tiền bị phong toả hoặc cầm cố cho khoản vay của bên liên quan', 'số dư tiền chỉ có tại ngày khoá sổ', 'tiền gửi tại tổ chức liên quan với lãi suất thấp'],
    doi_chieu: ['thuyết minh tiền và tiền gửi: ngân hàng, kỳ hạn, cầm cố', 'thư xác nhận số dư ngân hàng của kiểm toán', 'thuyết minh cam kết, bảo lãnh và tài sản đảm bảo'],
    tinh: (n, t) => {
      const c1 = cong(n.tien, n.dttc_nh), c0 = cong(t.tien, t.dttc_nh), cb = bq(c1, c0);
      if (!co(c1, n.vay, n.tts, n.dttc) || !(cb > 0)) return null;
      const sl = n.dttc / cb;
      return { kh: c1 / n.tts > 0.15 && n.vay / n.tts > 0.25 && sl < 0.02,
        bc: [['Tiền + đầu tư tài chính ngắn hạn', c1, 'ty'], ['Nợ vay', n.vay, 'ty'], ['Doanh thu tài chính/tiền bình quân', sl, 'pct']] };
    }
  },
  {
    id: 'R10', ten: 'Xây dựng dở dang lớn và không giảm',
    dieu_kien: 'XDCB dở dang > 15% tổng tài sản và không giảm trong 3 năm liền',
    gia_thuyet: ['dự án chậm tiến độ hoặc vướng pháp lý', 'chi phí (gồm lãi vay) được vốn hoá thay vì ghi vào chi phí', 'tiền chi cho nhà thầu/bên liên quan dưới danh nghĩa đầu tư'],
    doi_chieu: ['thuyết minh XDCB dở dang: danh mục dự án, tiến độ', 'pháp lý, quy hoạch, giấy phép dự án', 'hợp đồng với nhà thầu chính và quan hệ bên liên quan'],
    tinh: (n, t, t2, y) => {
      if (!t2 || !co(n.xdcb, t.xdcb, t2.xdcb, n.tts)) return n.xdcb === null || n.xdcb === 0 ? { kh: false, bc: [] } : null;
      return { kh: n.xdcb / n.tts > 0.15 && n.xdcb >= t.xdcb && t.xdcb >= 0.9 * t2.xdcb,
        bc: [[`XDCB dở dang ${y - 2}`, t2.xdcb, 'ty'], [`XDCB dở dang ${y - 1}`, t.xdcb, 'ty'], [`XDCB dở dang ${y}`, n.xdcb, 'ty'], ['XDCB/TTS', n.xdcb / n.tts, 'pct']] };
    }
  },
  {
    id: 'R11', ten: 'Sống bằng nợ',
    dieu_kien: 'CFO âm 2 năm liền, lưu chuyển tiền tài chính dương và nợ vay tăng > 20%',
    gia_thuyet: ['kinh doanh không tự tạo tiền, phụ thuộc vay mới để đảo nợ', 'tiền vay được chuyển sang đầu tư hoặc bên liên quan'],
    doi_chieu: ['thuyết minh vay: lịch đáo hạn, tài sản đảm bảo', 'nghị quyết ĐHĐCĐ/HĐQT về vay, phát hành', 'công bố thông tin trái phiếu doanh nghiệp (HNX) nếu có'],
    tinh: (n, t, t2, y) => {
      const g = tg(n.vay, t.vay);
      if (!co(n.cfo, t.cfo, n.cff)) return null;
      return { kh: n.cfo < 0 && t.cfo < 0 && n.cff > 0 && g !== null && g > 0.2,
        bc: [[`CFO ${y - 1}`, t.cfo, 'ty'], [`CFO ${y}`, n.cfo, 'ty'], ['Lưu chuyển tiền tài chính', n.cff, 'ty'], ['Tăng trưởng nợ vay', g, 'pct']] };
    }
  },
  {
    id: 'R12', ten: 'Biên gộp tăng trong khi hàng tồn ứ',
    dieu_kien: 'biên lợi nhuận gộp tăng ≥ 2 điểm % trong khi số ngày tồn kho tăng ≥ 20% và tồn kho > 5% tổng tài sản',
    gia_thuyet: ['chi phí bị đẩy vào tồn kho thay vì giá vốn', 'chưa trích đủ dự phòng giảm giá hàng tồn kho'],
    doi_chieu: ['thuyết minh hàng tồn kho và dự phòng', 'biên gộp của doanh nghiệp cùng ngành cùng kỳ', 'ý kiến kiểm toán về tồn kho'],
    tinh: (n, t) => {
      const m1 = tl(n.ln_gop, n.dt), m0 = tl(t.ln_gop, t.dt), d1 = tl(n.ton_kho, n.gv), d0 = tl(t.ton_kho, t.gv), r = tl(n.ton_kho, n.tts);
      if (!co(m1, m0, d1, d0, r) || !(d0 > 0)) return null;
      return { kh: m1 - m0 >= 0.02 && d1 / d0 - 1 >= 0.2 && r > 0.05,
        bc: [['Biên gộp năm trước', m0, 'pct'], ['Biên gộp năm nay', m1, 'pct'], ['Số ngày tồn kho năm trước', d0 * 365, 'ngay'], ['Số ngày tồn kho năm nay', d1 * 365, 'ngay']] };
    }
  },
  {
    id: 'R13', ten: 'Cổ đông thiểu số hưởng phần lớn lợi nhuận',
    dieu_kien: 'LNST của cổ đông không kiểm soát > 40% LNST trong khi lợi ích cổ đông không kiểm soát < 15% vốn chủ',
    gia_thuyet: ['lợi nhuận được dồn vào công ty con có cổ đông khác (có thể là bên liên quan)', 'cấu trúc sở hữu chéo phức tạp'],
    doi_chieu: ['thuyết minh danh sách công ty con và tỷ lệ sở hữu', 'BCTC riêng công ty mẹ so với hợp nhất', 'cơ cấu cổ đông của công ty con lãi lớn'],
    tinh: n => {
      if (!co(n.lnst, n.ln_cdkks, n.vcsh) || !(n.lnst > 0)) return co(n.lnst) ? { kh: false, bc: [] } : null;
      const a = n.ln_cdkks / n.lnst, b = tl(n.cdkks || 0, n.vcsh);
      return { kh: a > 0.4 && b !== null && b < 0.15, bc: [['LNST cổ đông không kiểm soát/LNST', a, 'pct'], ['Lợi ích CĐ không kiểm soát/vốn chủ', b, 'pct']] };
    }
  },
  {
    id: 'R14', ten: 'Phải thu ngắn hạn chuyển thành khoản dài hạn',
    dieu_kien: 'phải thu ngắn hạn giảm > 30%, phải thu dài hạn + đầu tư tài chính dài hạn tăng ≥ 50% mức giảm, trong khi tiền chi đầu tư < 30% mức tăng',
    gia_thuyet: ['hoán đổi phải thu khó đòi thành khoản đầu tư/phải thu dài hạn để né trích lập dự phòng', 'cấn trừ công nợ với bên liên quan bằng tài sản hoặc cổ phần'],
    doi_chieu: ['thuyết minh phải thu dài hạn và đầu tư góp vốn: đối tượng, giá trị', 'biên bản cấn trừ công nợ, nghị quyết HĐQT liên quan', 'giao dịch phi tiền tệ trên báo cáo lưu chuyển tiền tệ'],
    tinh: (n, t) => {
      if (!co(n.pt_nh, t.pt_nh) || !(t.pt_nh > 0)) return null;
      const giam = t.pt_nh - n.pt_nh, dh1 = cong(n.pt_dh, n.dttc_dh) || 0, dh0 = cong(t.pt_dh, t.dttc_dh) || 0, tang = dh1 - dh0;
      const chi = cong(n.capex, n.chi_cho_vay, n.chi_gop_von) || 0;
      return { kh: giam / t.pt_nh > 0.3 && tang >= 0.5 * giam && chi < 0.3 * tang,
        bc: [['Phải thu ngắn hạn giảm', giam, 'ty'], ['Phải thu dài hạn + đầu tư dài hạn tăng', tang, 'ty'], ['Tiền chi đầu tư trong năm', chi, 'ty']] };
    }
  },
  {
    id: 'R15', ten: 'Doanh thu tăng đột biến, dòng tiền đi ngược',
    dieu_kien: 'doanh thu thuần tăng > 50% nhưng CFO giảm so với năm trước',
    gia_thuyet: ['doanh thu từ hợp đồng lớn bất thường hoặc bên liên quan', 'ghi nhận doanh thu bàn giao dự án một lần', 'doanh thu chưa thu được tiền'],
    doi_chieu: ['thuyết minh doanh thu theo khách hàng/mảng', 'hợp đồng kinh tế lớn và công bố thông tin liên quan', 'BCTC quý: doanh thu dồn vào quý nào'],
    tinh: (n, t, t2, y) => {
      const g = tg(n.dt, t.dt);
      if (!co(g, n.cfo, t.cfo)) return null;
      return { kh: g > 0.5 && n.cfo < t.cfo, bc: [['Tăng trưởng doanh thu thuần', g, 'pct'], [`CFO ${y - 1}`, t.cfo, 'ty'], [`CFO ${y}`, n.cfo, 'ty']] };
    }
  },
  {
    id: 'R16', ten: 'Lỗ luỹ kế ăn mòn vốn', muc_bao_cao: 'tai_san',
    dieu_kien: 'lỗ luỹ kế (lợi nhuận sau thuế chưa phân phối âm) > 50% vốn góp, hoặc vốn chủ sở hữu âm',
    gia_thuyet: ['thua lỗ kéo dài nhiều năm đã bào mòn phần lớn vốn cổ đông góp vào', 'doanh nghiệp có thể rơi vào diện cảnh báo/kiểm soát hoặc phải tái cấu trúc, phát hành thêm để bù vốn'],
    doi_chieu: ['thuyết minh vốn chủ sở hữu và biến động lợi nhuận chưa phân phối', 'ý kiến kiểm toán về khả năng hoạt động liên tục', 'nghị quyết ĐHĐCĐ về phương án khắc phục lỗ, tái cấu trúc, phát hành', 'thông báo của Sở giao dịch về diện cảnh báo/kiểm soát'],
    tinh: n => {
      if (!co(n.von_gop, n.lncpp, n.vcsh) || !(n.von_gop > 0)) return null;
      const r = n.lncpp < 0 ? -n.lncpp / n.von_gop : 0;
      return { kh: r > 0.5 || n.vcsh < 0, bc: [['Vốn góp', n.von_gop, 'ty'], ['Lợi nhuận chưa phân phối', n.lncpp, 'ty'], ['Lỗ luỹ kế/vốn góp', r, 'pct'], ['Vốn chủ sở hữu', n.vcsh, 'ty']] };
    }
  }
];
// Mục báo cáo mà nghi vấn của từng quy tắc được đặt vào (Phần 3 kết quả kinh doanh, Phần 4 tài sản–nguồn vốn, Phần 5 dòng tiền).
const MUC_BAO_CAO = { R01: 'dong_tien', R02: 'dong_tien', R03: 'kqkd', R04: 'tai_san', R05: 'tai_san', R06: 'kqkd', R07: 'tai_san', R08: 'tai_san',
  R09: 'tai_san', R10: 'tai_san', R11: 'dong_tien', R12: 'kqkd', R13: 'kqkd', R14: 'tai_san', R15: 'dong_tien', R16: 'tai_san' };
QUY_TAC.forEach(q => { q.muc_bao_cao = MUC_BAO_CAO[q.id]; });

// Diễn giải cho người đọc báo cáo: không dùng mã quy tắc, nói chuyện gì đang xảy ra.
const DIEN_GIAI = {
  R01: 'Sổ sách báo lãi hai năm liền, nhưng tiền thu về từ kinh doanh cộng lại vẫn âm – lãi chưa biến thành tiền.',
  R02: 'Một phần lớn lợi nhuận chỉ nằm trên giấy (ước tính, ghi nhận trước), chưa có tiền tương ứng chảy vào.',
  R03: 'Tiền khách hàng còn nợ tăng nhanh hơn hẳn doanh thu – bán được hàng nhưng chậm thu được tiền.',
  R04: 'Hàng tồn kho phình nhanh hơn nhiều so với lượng hàng bán ra – hàng nằm kho lâu hơn.',
  R05: 'Tiền đi ra ngoài dưới dạng ứng trước, cho vay, phải thu khác chiếm phần đáng kể tài sản – tiền rời doanh nghiệp mà chưa đổi lại được hàng hoá hay tài sản rõ ràng.',
  R06: 'Phần lớn lợi nhuận không đến từ việc bán hàng chính, mà từ các khoản tài chính, thanh lý hay thu nhập khác.',
  R07: 'Lợi thế thương mại (phần trả thêm khi mua công ty khác) thay đổi mạnh trong năm – có thương vụ mua/bán hoặc ghi giảm giá trị.',
  R08: 'Doanh nghiệp vay nhiều nhưng chi phí lãi vay ghi nhận thấp bất thường – có thể lãi vay đang được cộng vào giá trị dự án/tồn kho thay vì ghi vào chi phí.',
  R09: 'Vừa giữ nhiều tiền, vừa vay nhiều, nhưng tiền gửi gần như không sinh lãi – điều khó giải thích nếu tiền thực sự sẵn có.',
  R10: 'Công trình xây dựng dở dang lớn và không giảm suốt ba năm – dự án chưa hoàn thành, chưa tạo ra doanh thu.',
  R11: 'Kinh doanh hai năm liền không tự tạo ra tiền, doanh nghiệp phải vay thêm để duy trì.',
  R12: 'Biên lợi nhuận gộp tăng trong khi hàng tồn kho nằm lâu hơn – lời dày hơn dù bán chậm hơn.',
  R13: 'Cổ đông thiểu số ở công ty con hưởng phần lớn lợi nhuận dù chỉ nắm phần nhỏ vốn.',
  R14: 'Khoản phải thu ngắn hạn giảm mạnh, cùng lúc các khoản dài hạn tăng tương ứng mà gần như không có tiền chi ra – nợ khó đòi có thể đã được "đổi tên" thành khoản đầu tư dài hạn.',
  R15: 'Doanh thu tăng vọt nhưng dòng tiền từ kinh doanh lại đi xuống.',
  R16: 'Thua lỗ tích tụ qua nhiều năm đã ăn mất hơn một nửa số vốn cổ đông góp vào – phần vốn thực còn lại mỏng hơn nhiều so với vốn điều lệ trên giấy.'
};
QUY_TAC.forEach(q => { q.dien_giai = DIEN_GIAI[q.id]; });

// d = { bs, is, cf }: mảng dòng BCTC năm của Vietcap.
function danhGiaQuyTac(d, y) {
  const n = soNam(d, y), t = soNam(d, y - 1), t2 = soNam(d, y - 2);
  return QUY_TAC.map(q => {
    let r = null;
    if (n && t) { try { r = q.tinh(n, t, t2, y); } catch (e) { r = null; } }
    return { id: q.id, kich_hoat: r ? !!r.kh : null, bang_chung: r ? r.bc.filter(x => x[1] !== null && Number.isFinite(x[1])) : [], suy_luan: r && r.kh ? SL.suyLuan(q.id, n, t, t2, y) : null };
  });
}

function namMoiNhat(d) {
  const ys = (d.bs || []).filter(r => r && (r.lengthReport === undefined || +r.lengthReport === 5 || +r.lengthReport === 4)).map(r => +r.yearReport).filter(Number.isFinite);
  return ys.length ? Math.max(...ys) : null;
}

const fmtVi = (v, d) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
function fmtBC(v, kieu) {
  if (kieu === 'ty') return `${fmtVi(v / 1e9, Math.abs(v) >= 1e11 ? 0 : 2)} tỷ`;
  if (kieu === 'pct') return `${fmtVi(v * 100, 1)}%`;
  if (kieu === 'ngay') return `${fmtVi(v, 0)} ngày`;
  if (kieu === 'lan') return `${fmtVi(v, 2)} lần`;
  return String(v);
}

module.exports = { QUY_TAC, danhGiaQuyTac, namMoiNhat, soNam, fmtBC, fmtVi };
