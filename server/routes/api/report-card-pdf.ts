import { defineEventHandler, readBody, setResponseHeader, createError } from "h3";

/**
 * POST /api/report-card-pdf
 * Body: { html: string }  — full self-contained HTML of the report card
 * Returns: PDF binary (application/pdf)
 *
 * Uses puppeteer-core + system Chrome to render the HTML and export as A4 PDF.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { html?: string };
  if (!body?.html) throw createError({ statusCode: 400, message: "html required" });

  const chromePath =
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  let browser: any;
  try {
    const puppeteer = await import("puppeteer-core");
    browser = await puppeteer.default.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setContent(body.html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "10mm", right: "12mm", bottom: "10mm", left: "12mm" },
      printBackground: true,
    });

    setResponseHeader(event, "Content-Type", "application/pdf");
    setResponseHeader(event, "Content-Disposition", "attachment; filename=\"report-card.pdf\"");
    return pdfBuffer;
  } finally {
    if (browser) await browser.close();
  }
});
