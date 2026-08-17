async function mountWhatsappSlot() {
  const slot = document.getElementById("whatsapp-slot");
  if (!slot) return;

  try {
    const res = await fetch("/api/salud");
    if (!res.ok) return;
    const data = await res.json();
    const n = data && data.whatsapp;
    if (typeof n !== "string" || n.length === 0) return;

    const a = document.createElement("a");
    a.className = "btn btn-whatsapp";
    a.href = `https://wa.me/${encodeURIComponent(n)}?text=${encodeURIComponent("Hola")}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Escribir por WhatsApp";
    slot.replaceChildren(a);
  } catch {
    // leave slot empty if salud is unreachable
  }
}

mountWhatsappSlot();
