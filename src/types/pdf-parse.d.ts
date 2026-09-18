declare module "pdf-parse" {
  type PdfParseResult = {
    text: string;
    numpages: number;
  };

  export default function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
}
