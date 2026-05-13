async function run() {
    const links = document.getElementById("input")
        .value.split("\n")
        .map(l => l.trim())
        .filter(Boolean);

    document.getElementById("out").innerText = "جاري... ⏳";

    const res = await fetch("/resolve", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ links })
    });

    const data = await res.json();

    console.log("SERVER RESPONSE:", data); // 👈 مهم جدًا

    let out = "";

    if (data.results && data.results.length > 0) {
        out += "📊 RESULTS:\n" + data.results.join("\n");
    } else {
        out += "❌ مفيش نتائج رجعت من السيرفر";
    }

    document.getElementById("out").innerText = out;
}