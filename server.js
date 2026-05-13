const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json());
app.use(express.static("public"));

let browser;

async function getBrowser() {
    if (!browser) {
        browser = await chromium.launch({ headless: true });
        console.log("🌐 متصفح جديد اشتغل");
    }
    return browser;
}

// endpoint للـ SSE
app.post("/resolve-stream", async (req, res) => {
    const links = Array.isArray(req.body.links) ? req.body.links : [];

    if (links.length === 0) {
        return res.json({ error: "مفيش روابط" });
    }

    // إعدادات SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const browser = await getBrowser();
    let successCount = 0;
    let failedCount = 0;

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    async function resolve(url, index) {
        const page = await browser.newPage();

        try {
            sendEvent('log', { 
                message: `🔓 [${index + 1}/${links.length}] جاري فتح: ${url}`,
                type: 'info'
            });

            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: 50000
            });

            await page.waitForTimeout(6000);

            let currentUrl = page.url();
            let finalUrl = currentUrl;

            if (currentUrl.includes("facebook.com/login")) {
                try {
                    const parsed = new URL(currentUrl);
                    const next = parsed.searchParams.get("next");
                    if (next) {
                        finalUrl = decodeURIComponent(next);
                    }
                } catch (e) {}
            }

            if (!finalUrl.includes("apps.facebook.com/family-farm/")) {
                sendEvent('log', { 
                    message: `⚠️ [${index + 1}] تم تجاهل: ${finalUrl}`,
                    type: 'warning'
                });
                failedCount++;
                return null;
            }

            successCount++;
            
            // 🔥 إرسال الرابط مباشرة حالما يتفك
            sendEvent('result', {
                index: index,
                original: url,
                resolved: finalUrl,
                success: true,
                total: links.length,
                completed: successCount + failedCount,
                successCount: successCount,
                failedCount: failedCount
            });

            sendEvent('log', { 
                message: `✅ [${index + 1}] تم فك الرابط بنجاح`,
                type: 'success'
            });

            return finalUrl;

        } catch (err) {
            failedCount++;
            
            sendEvent('result', {
                index: index,
                original: url,
                resolved: null,
                success: false,
                total: links.length,
                completed: successCount + failedCount,
                successCount: successCount,
                failedCount: failedCount
            });

            sendEvent('log', { 
                message: `❌ [${index + 1}] فشل: ${err.message}`,
                type: 'error'
            });
            
            return null;
        } finally {
            await page.close();
        }
    }

    sendEvent('start', { total: links.length });

    const BATCH_SIZE = 15; // Batch أصغر عشان النتائج تظهر أسرع
    for (let i = 0; i < links.length; i += BATCH_SIZE) {
        const chunk = links.slice(i, i + BATCH_SIZE);
        
        const batchPromises = chunk.map(async (link, idx) => {
            const globalIndex = i + idx;
            await resolve(link, globalIndex);
        });
        
        await Promise.all(batchPromises);
    }

    sendEvent('complete', {
        total: links.length,
        successCount: successCount,
        failedCount: failedCount
    });

    res.end();
});

process.on("SIGINT", async () => {
    if (browser) await browser.close();
    process.exit();
});

app.listen(3000, () => {
    console.log("🚀 السيرفر شغال: http://localhost:3000");
});