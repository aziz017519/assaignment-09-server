import PDFDocument from 'pdfkit';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const ACCENT = '#0ea5e9';

function safeText(value, fallback = '—') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function asDate(value) {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function invoiceDateKey(value) {
    const date = asDate(value) ?? new Date();
    return date.toISOString().slice(0, 10).replaceAll('-', '');
}

export function formatInvoiceDate(value) {
    const date = asDate(value);
    if (!date)
        return '—';
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

export function formatMoney(amount, currency) {
    const value = Number(amount);
    const code = safeText(currency, 'usd').toUpperCase();
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: code,
            minimumFractionDigits: 2,
        }).format(Number.isFinite(value) ? value : 0);
    }
    catch {
        return `${code} ${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
    }
}

export function buildInvoicePdf(details) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 48,
            bufferPages: true,
            info: {
                Title: `Invoice ${details.invoiceNumber}`,
                Author: 'FixMate',
                Subject: 'Paid booking receipt',
            },
        });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const left = doc.page.margins.left;
        const right = doc.page.width - doc.page.margins.right;
        const width = right - left;
        const column = width / 2 - 14;

        function sectionTitle(text, y) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT).text(text.toUpperCase(), left, y);
            return y + 16;
        }

        function keyValue(label, value, x, y, labelWidth) {
            doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, x, y, { width: labelWidth });
            doc
                .font('Helvetica-Bold')
                .fontSize(10)
                .fillColor(INK)
                .text(safeText(value), x, y + 12, { width: labelWidth });
        }

        // Header band.
        doc.rect(0, 0, doc.page.width, 112).fill(INK);
        doc.font('Helvetica-Bold').fontSize(24).fillColor('#ffffff').text('FixMate', left, 38);
        doc.font('Helvetica').fontSize(10).fillColor('#cbd5e1').text('Repair services, made simple', left, 70);
        doc
            .font('Helvetica-Bold')
            .fontSize(16)
            .fillColor('#ffffff')
            .text('INVOICE', right - 150, 38, { width: 150, align: 'right' });
        doc
            .font('Helvetica')
            .fontSize(9.5)
            .fillColor('#cbd5e1')
            .text(details.invoiceNumber, right - 210, 68, { width: 210, align: 'right' });

        // Dates and payment status.
        let y = sectionTitle('Payment details', 138);
        keyValue('Issue date', details.issueDate, left, y, column);
        keyValue('Paid date', details.paidDate, right - column, y, column);
        keyValue('Payment status', 'PAID', left, y + 38, column);
        keyValue('Booking reference', details.bookingReference, right - column, y + 38, column);
        y += 72;

        // Parties.
        y = sectionTitle('Billed to', y);
        keyValue('Customer', details.customerName, left, y, column);
        keyValue('Email', details.customerEmail, right - column, y, column);
        y += 38;
        y = sectionTitle('Technician', y);
        keyValue('Name', details.technicianName, left, y, width);
        y += 38;

        // Service details.
        y = sectionTitle('Service details', y);
        doc
            .rect(left, y, width, 30)
            .fill('#f1f5f9');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
        doc.text('DESCRIPTION', left + 10, y + 10, { width: column - 10 });
        doc.text('CATEGORY', left + column + 10, y + 10, { width: column - 10 });
        doc.text('AMOUNT', right - 110, y + 10, { width: 100, align: 'right' });
        y += 30;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
        doc.text(safeText(details.serviceTitle), left + 10, y + 9, { width: column - 10 });
        doc.text(safeText(details.category), left + column + 10, y + 9, { width: column - 10 });
        doc.text(formatMoney(details.amount, details.currency), right - 110, y + 9, {
            width: 100,
            align: 'right',
        });
        y += 32;

        // Work description.
        y = sectionTitle('Description of work', y + 10);
        doc
            .font('Helvetica')
            .fontSize(9.5)
            .fillColor(INK)
            .text(safeText(details.description), left, y, { width, lineGap: 2 });
        y = doc.y + 18;

        // Total, right aligned.
        doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
        doc.text('TOTAL PAID', left, y + 14, { width: width - 150, align: 'right' });
        doc.fontSize(16).fillColor(ACCENT);
        doc.text(formatMoney(details.amount, details.currency), right - 150, y + 10, {
            width: 150,
            align: 'right',
        });

        // Footer line.
        const footerY = doc.page.height - 76;
        doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor(LINE).lineWidth(1).stroke();
        doc
            .font('Helvetica')
            .fontSize(8.5)
            .fillColor(MUTED)
            .text('Thank you for choosing FixMate. This receipt confirms a completed, paid booking.', left, footerY + 14, {
                width,
                align: 'center',
            });

        doc.end();
    });
}
