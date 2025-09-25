const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Hàm format số tiền
const fmt = (n) => (n == null ? '0' : new Intl.NumberFormat('vi-VN').format(n));

/**
 * Gửi email linh hoạt
 * @param {string} to - email người nhận
 * @param {object} options - {
 *   type: 'invoice' | 'otp' | 'custom',
 *   order,           // dữ liệu order (nếu type=invoice)
 *   items,           // danh sách sản phẩm (nếu type=invoice)
 *   otpCode,         // mã OTP 6 số (nếu type=otp)
 *   subject,         // tiêu đề email
 *   htmlContent      // html tùy biến (nếu type=custom)
 * }
 */
async function sendMail(to, options = {}) {
  console.log("📧 [sendMail] to=", to);
  const { type, order, items, otpCode, subject, htmlContent } = options;

  let html = htmlContent;

  if (type === 'invoice' && order && items) {
    const itemRows = items.map((item, i) => {
      const imgHtml = item.image ? `<img src="${item.image}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;" alt="${item.name}"/>` : '';
      return `
        <tr>
          <td style="padding:8px;border:1px solid #eee;text-align:center;">${i + 1}</td>
          <td style="padding:8px;border:1px solid #eee;">
            <div style="display:flex;gap:10px;align-items:center;">
              ${imgHtml}
              <div>
                <div style="font-weight:600;">${item.name || ''}</div>
                <div style="font-size:12px;color:#666;">Mã: ${item.barcode || '-'}</div>
                <div style="font-size:12px;color:#666;">Loại: ${item.category || '-'}</div>
              </div>
            </div>
          </td>
          <td style="padding:8px;border:1px solid #eee;text-align:center;">${item.quantity ?? 1}</td>
          <td style="padding:8px;border:1px solid #eee;text-align:right;">${fmt(item.price)} đ</td>
        </tr>
      `;
    }).join('');

    html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:740px;margin:20px auto;padding:24px;border-radius:8px;background:#fff;border:1px solid #f0f0f0;">
        <h2>DuckBunn Store - Hóa đơn điện tử</h2>
        <p>Mã đơn: <strong>${order.order_code}</strong></p>
        <p>Ngày: ${order.created_at ? new Date(order.created_at).toLocaleString('vi-VN') : ''}</p>

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th>#</th><th>Sản phẩm</th><th>Số lượng</th><th>Đơn giá</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <p>Tổng thanh toán: ${fmt(order.tongtien)} đ</p>
        <p>Cảm ơn bạn đã mua hàng tại DuckBunn Store!</p>
      </div>
    `;
  }

  if (type === 'otp' && otpCode) {
    html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:20px auto;padding:24px;border-radius:8px;background:#fff;border:1px solid #f0f0f0;text-align:center;">
        <h2>Mã xác thực của bạn</h2>
        <p style="font-size:28px;font-weight:bold;color:#1f3a93;">${otpCode}</p>
        <p>Nhập mã này để xác thực tài khoản hoặc thao tác của bạn.</p>
      </div>
    `;
  }

  const info = await transporter.sendMail({
    from: `"DuckBunn Store" <${process.env.EMAIL_USER}>`,
    to,
    subject: subject || 'DuckBunn Store',
    html
  });

  return info;
}

module.exports = { sendMail };
