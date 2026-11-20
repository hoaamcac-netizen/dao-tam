export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { authorId, amountXu, amountVnd, bankName, accountNumber, accountHolder } = req.body || {};
  if (!authorId || !amountXu || amountXu < 1000) {
    return res.status(400).json({ success: false, error: 'Số Xu rút tối thiểu là 1.000 Xu (tương đương 1.000đ)' });
  }

  return res.status(200).json({
    success: true,
    message: `Đã tiếp nhận yêu cầu rút ${amountXu} Xu về tài khoản ${bankName} - ${accountNumber} (${accountHolder}). Ban Quản Trị Đạo Tâm sẽ chuyển khoản trong 24h.`,
    remainingXu: 0,
  });
}
