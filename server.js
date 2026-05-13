const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(".")); // عشان يخدم ملف index.html

app.post("/resolve-stream", async (req, res) => {
    const links = Array.isArray(req.body.links) ? req.body.links : [];
    
    if (links.length === 0) {
        return res.json({ error: "مفيش روابط" });
    }
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const browser = await chromium.launch({ headless: true });
    let successCount = 0;
    let failedCount = 0;
    
    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    
    sendEvent('start', { total: links.length });
    
    for (let i = 0; i < links.length; i++) {
        const url = links[i];
        const page = await browser.newPage();
        
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 50000 });
            await page.waitForTimeout(6000);
            
            let finalUrl = page.url();
            
            if (finalUrl.includes("facebook.com/login")) {
                try {
                    const parsed = new URL(finalUrl);
                    const next = parsed.searchParams.get("next");
                    if (next) finalUrl = decodeURIComponent(next);
                } catch(e) {}
            }
            
            if (finalUrl.includes("apps.facebook.com/family-farm/")) {
                successCount++;
                sendEvent('result', {
                    original: url,
                    resolved: finalUrl,
                    success: true,
                    completed: successCount + failedCount,
                    successCount: successCount,
                    failedCount: failedCount,
                    total: links.length
                });
            } else {
                failedCount++;
                sendEvent('result', {
                    original: url,
                    resolved: null,
                    success: false,
                    completed: successCount + failedCount,
                    successCount: successCount,
                    failedCount: failedCount,
                    total: links.length
                });
            }
        } catch(err) {
            failedCount++;
            sendEvent('result', {
                original: url,
                resolved: null,
                success: false,
                completed: successCount + failedCount,
                successCount: successCount,
                failedCount: failedCount,
                total: links.length
            });
        } finally {
            await page.close();
        }
    }
    
    await browser.close();
    sendEvent('complete', { successCount, failedCount, total: links.length });
    res.end();
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
