import {generatePDF} from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import {DailyMilkRecord, MilkProfile, QuantityHistory} from '../types/milk.types';
import {formatCurrency, formatLitres, getEffectiveQuantity} from './milkCalculation';
import {monthName} from '../utils/dateUtils';
import {colors} from '../theme/colors';
import type {BillDetails} from './api/billingApiService';
import {getMilkDeliveryColors, getMilkDeliveryLabel, getMilkDeliveryStatus} from '../utils/milkStatus';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function generateAndSharePdf(
  profile: MilkProfile,
  month: string,
  records: DailyMilkRecord[],
  quantityHistory: QuantityHistory[],
  bill: BillDetails,
): Promise<string> {
  const rows = records.map(record => {
    const status = getMilkDeliveryStatus(
      record.quantityMl,
      getEffectiveQuantity(record.date, profile, quantityHistory),
      true,
    );
    const statusColors = getMilkDeliveryColors(status);
    return `
    <tr style="background-color:${statusColors.backgroundColor}; -webkit-print-color-adjust: exact;">
      <td>${escapeHtml(record.date)}</td>
      <td>${formatLitres(record.quantityMl)}</td>
      <td>${formatCurrency(record.pricePerLitrePaise)}</td>
      <td>${formatCurrency(record.amountPaise)}</td>
      <td style="color:${statusColors.textColor};">${getMilkDeliveryLabel(status)}</td>
    </tr>`;
  }).join('');
  const html = `
    <html><head><style>
      body { font-family: Arial, sans-serif; padding: 24px; color: ${colors.text}; }
      h1 { color: ${colors.primary}; } table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid ${colors.border}; padding: 7px; font-size: 11px; text-align: right; }
      th:first-child, td:first-child { text-align: left; } th { background: ${colors.surface}; }
      .summary { margin: 16px 0; line-height: 1.7; } .footer { margin-top: 16px; }
    </style></head><body>
      <h1>MilkTracker</h1>
      <h2>${escapeHtml(monthName(month))} Milk Statement</h2>
      <p>Profile: ${escapeHtml(profile.name)}</p>
      <table><thead><tr><th>Date</th><th>Quantity</th><th>Price/L</th><th>Amount</th><th>Delivery</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="summary">
        <strong>Total litres:</strong> ${formatLitres(bill.totalQuantityMl)}<br/>
        <strong>Current month bill:</strong> ${formatCurrency(bill.totalAmountPaise)}<br/>
        <strong>Previous outstanding:</strong> ${formatCurrency(bill.previousOutstandingPaise)}<br/>
        <strong>Amount paid this month:</strong> ${formatCurrency(bill.amountPaidPaise)}<br/>
        <strong>Remaining this month:</strong> ${formatCurrency(bill.remainingAmountPaise)}<br/>
        <strong>Final payable:</strong> ${formatCurrency(bill.totalPayablePaise)}<br/>
        <strong>Payment status:</strong> ${bill.paymentStatus.replace('_', ' ').toUpperCase()}
      </div>
      ${bill.paymentHistory.length ? `<h3>Payment history</h3><ul>${bill.paymentHistory.map(payment =>
    `<li>${escapeHtml(payment.paymentDate)} — ${formatCurrency(payment.amountPaise)} (${escapeHtml(payment.paymentMethod)})${payment.note ? ` — ${escapeHtml(payment.note)}` : ''}</li>`,
  ).join('')}</ul>` : ''}
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