// Shinobi Fighter Download-Seite: Login (Spiel-Accounts) -> Freischaltung (members.approved) -> neueste Releases
// -> Download über signierte URLs (10 min). Grosse Zips liegen in Teilen (.part0 …) und werden im Browser zusammengesetzt.
const sb = supabase.createClient(SHINOBI.url, SHINOBI.key);
const $ = (id) => document.getElementById(id);
const show = (id) => ["login", "register", "locked", "downloads"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
const mb = (b) => (b / 1048576).toFixed(1) + " MB";
const NAMES = { mac: "Mac (Apple Silicon + Intel)", windows: "Windows (64 Bit)" };

async function refresh() {
	const { data: { session } } = await sb.auth.getSession();
	if (!session) return show("login");
	const { data: mem } = await sb.from("members").select("approved").eq("user_id", session.user.id).maybeSingle();
	if (!mem || !mem.approved) return show("locked");
	const { data: prof } = await sb.from("profiles").select("username").eq("id", session.user.id).maybeSingle();
	$("who").textContent = "Angemeldet als " + (prof ? prof.username : session.user.email);
	const { data: rel, error } = await sb.from("releases").select("*").order("created_at", { ascending: false });
	const cards = $("cards");
	cards.innerHTML = "";
	if (error) $("dl-msg").textContent = "Fehler: " + error.message;
	const mine = /Mac/i.test(navigator.platform || navigator.userAgent) ? "mac" : "windows";
	for (const plat of [mine, mine === "mac" ? "windows" : "mac"]) {
		const r = (rel || []).find((x) => x.platform === plat);
		const card = document.createElement("div");
		card.className = "card";
		if (!r) {
			card.innerHTML = `<h3>${NAMES[plat]}</h3><p class="dim">Noch keine Version hochgeladen.</p>`;
		} else {
			card.innerHTML = `<h3>${NAMES[plat]}</h3>
				<div class="meta">v${r.version} · ${mb(r.size_bytes)} · ${new Date(r.created_at).toLocaleDateString("de-CH")}</div>
				<div class="changelog"></div><button>Download v${r.version}</button><div class="bar hidden"><i></i></div>`;
			card.querySelector(".changelog").textContent = r.changelog || "";
			card.querySelector("button").onclick = (e) => download(r, e.target, card.querySelector(".bar"));
		}
		cards.appendChild(card);
	}
	show("downloads");
}

async function download(r, btn, bar) {
	const msg = $("dl-msg");
	msg.className = "msg";
	msg.textContent = "";
	btn.disabled = true;
	try {
		const paths = [...Array(r.parts).keys()].map((i) => `${r.storage_path}.part${i}`);
		const { data, error } = await sb.storage.from("releases").createSignedUrls(paths, 600);
		if (error) throw error;
		bar.classList.remove("hidden");
		const blobs = [];
		let done = 0;
		for (const s of data) {  // Teile nacheinander laden, Fortschritt anzeigen
			if (s.error) throw new Error(s.error);
			const res = await fetch(s.signedUrl);
			if (!res.ok) throw new Error("HTTP " + res.status);
			const reader = res.body.getReader();
			for (;;) {
				const { done: end, value } = await reader.read();
				if (end) break;
				blobs.push(value);
				done += value.length;
				bar.firstElementChild.style.width = Math.min(100, (done / r.size_bytes) * 100) + "%";
			}
		}
		const url = URL.createObjectURL(new Blob(blobs, { type: "application/zip" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = r.storage_path.split("/").pop();
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 60000);
		msg.className = "msg ok";
		msg.textContent = "Fertig – Anleitung unten unter „Installieren“.";
	} catch (e) {
		msg.textContent = "Download fehlgeschlagen: " + (e.message || e);
	}
	btn.disabled = false;
}

$("login-form").onsubmit = async (e) => {
	e.preventDefault();
	$("login-msg").textContent = "";
	const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("pw").value });
	if (error) $("login-msg").textContent = /invalid/i.test(error.message) ? "E-Mail oder Passwort falsch." : error.message;
	else refresh();
};
document.querySelectorAll("[data-logout]").forEach((b) => (b.onclick = async () => { await sb.auth.signOut(); show("login"); }));
refresh();

// Neues Konto (gleiches Konto wie im Spiel; Username landet per Trigger in profiles, Freischaltung macht der Admin).
$("to-register").onclick = (e) => { e.preventDefault(); show("register"); };
$("to-login").onclick = (e) => { e.preventDefault(); show("login"); };
$("reg-form").onsubmit = async (e) => {
	e.preventDefault();
	const msg = $("reg-msg");
	msg.className = "msg";
	const name = $("r-name").value.trim();
	if ($("r-pw").value !== $("r-pw2").value) return (msg.textContent = "Passwörter sind nicht gleich.");
	const { data: free, error: e1 } = await sb.rpc("username_available", { name });
	if (e1) return (msg.textContent = "Fehler: " + e1.message);
	if (!free) return (msg.textContent = "Username ist schon vergeben oder ungültig.");
	const { data, error } = await sb.auth.signUp({ email: $("r-email").value.trim(), password: $("r-pw").value, options: { data: { username: name } } });
	if (error) return (msg.textContent = /registered|exists/i.test(error.message) ? "Diese E-Mail hat schon ein Konto." : error.message);
	msg.className = "msg ok";
	msg.textContent = "Konto erstellt!";
	if (data.session) refresh();
	else { show("login"); $("login-msg").className = "msg ok"; $("login-msg").textContent = "Konto erstellt – jetzt anmelden."; }
};
