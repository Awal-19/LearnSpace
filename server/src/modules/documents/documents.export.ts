import { Document as DocxDocument, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';

export interface ExportSection {
  heading: string;
  meta?: string;
  prompt: string;
  body: string;
}

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''))
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

export async function buildPdfBuffer(params: {
  title: string;
  subtitle?: string;
  sections: ExportSection[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text(params.title);
    if (params.subtitle) {
      doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('#555555').text(params.subtitle);
    }
    doc.fillColor('#000000').moveDown(1);

    for (const section of params.sections) {
      doc.fontSize(13).font('Helvetica-Bold').text(section.heading);
      if (section.meta) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#555555').text(section.meta);
      }
      doc.fillColor('#111111').moveDown(0.3);
      doc.fontSize(10.5).font('Helvetica-Bold').text(stripMarkdownFormatting(section.prompt));
      doc.moveDown(0.35);
      doc.fontSize(10).font('Helvetica').text(stripMarkdownFormatting(section.body), {
        lineGap: 3,
      });
      doc.moveDown(1);
    }

    doc.end();
  });
}

export async function buildDocxBuffer(params: {
  title: string;
  subtitle?: string;
  sections: ExportSection[];
}): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: params.title,
      heading: HeadingLevel.TITLE,
    }),
  ];

  if (params.subtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: params.subtitle, italics: true, color: '555555' })],
      }),
    );
  }

  for (const section of params.sections) {
    children.push(
      new Paragraph({
        text: section.heading,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 100 },
      }),
    );

    if (section.meta) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: section.meta, italics: true, size: 20, color: '666666' })],
        }),
      );
    }

    children.push(
      new Paragraph({
        children: [new TextRun({ text: stripMarkdownFormatting(section.prompt), bold: true })],
        spacing: { after: 120 },
      }),
    );

    const lines = stripMarkdownFormatting(section.body).split('\n');
    for (const line of lines) {
      children.push(
        new Paragraph({
          text: line,
          spacing: { after: 80 },
        }),
      );
    }
  }

  const doc = new DocxDocument({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
