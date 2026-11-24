import {generatePDF} from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import {DailyMilkRecord, MilkProfile} from '../types/milk.types';
import {formatCurrency, formatLitres} from './milkCalculation';
import {monthName} from '../utils/dateUtils';
import {colors} from '../theme/colors';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function generateAndSharePdf(
  profile: MilkProfile,
  month: string,
  records: DailyMilkRecord[],
): Promise<string> {
  const totalQuantity = records.reduce((sum, record) => sum + record.quantityMl, 0);
  const totalAmount = records.reduce((sum, record) => sum + record.amountPaise, 0);
  const rows = records.map(record => `
    <tr>
      <td>${record.date}</td>
      <td>${formatLitres(record.quantityMl)}</td>
      <td>${formatCurrency(record.pricePerLitrePaise)}</td>
      <td>${formatCurrency(record.amountPaise)}</td>
    </tr>`).join('');
  const html = `
    <html><head><style>
      body { font-family: Arial, sans-serif; padding: 24px; color: ${colors.text}; }
      h1 { color: ${colors.primary}; } table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid ${colors.border}; padding: 7px; font-size: 11px; text-align: right; }
      th:first-child, td:first-child { text-align: left; } th { background: ${colors.surface}; }
      .summary { margin: 16px 0; } .footer { margin-top: 16px; }
    </style></head><body>
      <h1>MilkTracker</h1>
      <h2>${escapeHtml(monthName(month))} Milk Statement</h2>
      <p>Profile: ${escapeHtml(profile.name)}</p>
      <table><thead><tr><th>Date</th><th>Quantity</th><th>Price/L</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="summary"><strong>Total litres:</strong> ${formatLitres(totalQuantity)}<br/>
      <strong>Total expense:</strong> ${formatCurrency(totalAmount)}</div>
      <div class="footer">Generated on ${new Date().toLocaleString('en-IN')}</div>
    </body></html>`;
  const file = await generatePDF({
    html,
    fileName: `MilkTracker-${month}`,
    base64: false,
  });
  if (!file.filePath) throw new Error('PDF file could not be created');
  await Share.open({
    title: 'MilkTracker statement',
    url: `file://${file.filePath}`,
    type: 'application/pdf',
  });
  return file.filePath;
}