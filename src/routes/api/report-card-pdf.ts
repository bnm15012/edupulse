import { createAPIFileRoute } from "@tanstack/react-start/api";

const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const APIRoute = createAPIFileRoute("/api/report-card-pdf")({
  POST: async ({ request }) => {
    const body = await request.json() as { html?: string; filename?: string };
    if (!body?.html) {
      return new Response("html required", { status: 400 });
    }

    try {
      const puppeteer = await import("puppeteer-core");
      const browser = await puppeteer.default.launch({
        executablePath: CHROME_PATH,
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
        return new Response(pdfBuffer, {
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
  },
});
