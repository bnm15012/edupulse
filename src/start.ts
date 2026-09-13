import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Handle /api/report-card-pdf — generate a real PDF via Puppeteer + system Chrome
const reportCardPdfMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const url = new URL(request.url);
    if (url.pathname !== "/api/report-card-pdf" || request.method !== "POST") {
      return next();
    }

    try {
      const body = await request.json() as { html?: string; filename?: string };
      if (!body?.html) return new Response("html required", { status: 400 });

      const chromePath =
        process.env.CHROME_PATH ??
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

      const puppeteer = await import("puppeteer-core");
      const browser = await puppeteer.default.launch({
        executablePath: chromePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });

      try {
        const page = await browser.newPage();
        await page.setContent(body.html, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({
          format: "A4",
          margin: { top: "10mm", right: "12mm", bottom: "10mm", left: "12mm" },
          printBackground: true,
        });

        const filename = body.filename ?? "report-card.pdf";
        return new Response(pdfBuffer as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      } finally {
        await browser.close();
      }
    } catch (err: any) {
      console.error("PDF generation error:", err);
      return new Response(err?.message ?? "PDF generation failed", { status: 500 });
    }
  }
);

export const startInstance = createStart(() => ({
  requestMiddleware: [reportCardPdfMiddleware, csrfMiddleware],
}));

export default startInstance;
