import { describe, expect, it } from "vitest";
import { fill, getDictionary } from "@/content/dictionaries";

function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

describe("dictionaries", () => {
  it("es has exactly the same keys and array lengths as en", () => {
    expect(leaves(getDictionary("es")).map(([p]) => p)).toEqual(leaves(getDictionary("en")).map(([p]) => p));
  });

  it("uses the same placeholders in both languages", () => {
    const es = new Map(leaves(getDictionary("es")));
    for (const [path, text] of leaves(getDictionary("en"))) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(es.get(path) ?? ""), path).toEqual(names(text));
    }
  });

  it("never mentions the old tiered fee or Whop", () => {
    for (const locale of ["en", "es"] as const) {
      for (const [path, text] of leaves(getDictionary(locale))) {
        expect(text, `${locale}.${path}`).not.toMatch(/15\s*%?\s*[–-]\s*25|20%|25%|whop/i);
      }
    }
  });

  it("never cites § 1671(d) as a grace-period rule", () => {
    for (const locale of ["en", "es"] as const) {
      for (const [path, text] of leaves(getDictionary(locale))) {
        expect(text, `${locale}.${path}`).not.toMatch(/1671/);
      }
    }
  });

  it("links every stat to an https source", () => {
    for (const locale of ["en", "es"] as const) {
      for (const item of getDictionary(locale).stats.items) expect(item.href).toMatch(/^https:\/\//);
    }
  });
});

describe("fill", () => {
  it("replaces known placeholders and keeps unknown ones visible", () => {
    expect(fill("Pay {fee} of {total}", { fee: "$96.00", total: "$640.00" })).toBe("Pay $96.00 of $640.00");
    expect(fill("Hi {name}", {})).toBe("Hi {name}");
  });
});

describe("Copy Desk final strings (PR #2)", () => {
  const en = getDictionary("en");
  const es = getDictionary("es");

  it("matches every listed key verbatim in both languages", () => {
    const expected: [string, string, string][] = [
      ["signup.passwordless", en.signup.passwordless, "Sign in with a one-time link we email you, or use a password."],
      ["signup.password.heading", en.signup.password.heading, "Or use a password"],
      ["signup.password.label", en.signup.password.label, "Password"],
      ["signup.password.hint", en.signup.password.hint, "At least {min} characters."],
      ["signup.password.signIn", en.signup.password.signIn, "Sign in with password"],
      ["signup.password.signUp", en.signup.password.signUp, "Create account with password"],
      ["signup.password.invalid", en.signup.password.invalid, "That email and password don't match. Try again, or reset your password."],
      ["signup.password.unconfirmed", en.signup.password.unconfirmed, "Confirm your email first. Open the link we sent you, then sign in."],
      ["signup.password.weak", en.signup.password.weak, "That password is too short. Use at least {min} characters."],
      ["signup.password.confirmSent", en.signup.password.confirmSent, "Almost there. Check your email to confirm your account, then sign in."],
      ["signup.password.forgot", en.signup.password.forgot, "Forgot your password?"],
      ["signup.password.sendReset", en.signup.password.sendReset, "Email me a reset link"],
      ["signup.password.resetSent", en.signup.password.resetSent, "If that email has an account, we sent a reset link. Check your inbox and spam folder."],
      ["signup.password.expired", en.signup.password.expired, "That link has expired or was already used. Request a new one."],
      ["signup.password.resetTitle", en.signup.password.resetTitle, "Set a new password"],
      ["signup.password.newLabel", en.signup.password.newLabel, "New password"],
      ["signup.password.save", en.signup.password.save, "Save new password"],
      ["signup.password.updateError", en.signup.password.updateError, "We couldn't save your password. Request a new reset link and try again."],
      ["result.feeTitleMinimum", en.result.feeTitleMinimum, "Pay the {fee} Minimum to Unlock"],
      ["result.feeLineMinimum", en.result.feeLineMinimum, "Upfront payment: {fee}. That's our minimum fee, because 15% of the {total} you're owed comes to less."],
      ["result.feeMinimumNote", en.result.feeMinimumNote, "Heads up: on a small amount, the minimum can be a big share of what you're owed, up to all of it. Only unlock if the report is worth it to you."],
      ["result.waived", en.result.waived, "No charge. You're owed less than $0.50, so your report is unlocked free."],
      ["dashboard.feeMinimum", en.dashboard.feeMinimum, "Upfront Fee ($0.50 minimum)"],
      ["dashboard.feeFree", en.dashboard.feeFree, "Upfront Fee (waived: under $0.50 owed)"],
      ["meta.description", en.meta.description, "Snap or upload your rent ledger and lease. LedgerFinesse checks every line against your lease and local renter laws, free. Pay 15% ($0.50 minimum) only if you're owed money."],
      ["footer.tagline", en.footer.tagline, "Free OCR Scan · 15% Only When Money Is Owed ($0.50 min) · © 2026 LedgerFinesse"],
      ["hero.note", en.hero.note, "100% free to scan. You only pay 15% upfront, with a $0.50 minimum, if our audit finds money you're owed."],
      ["how.steps[2].title", en.how.steps[2].title, "Pay 15% only if you are owed money"],
      ["how.steps[2].body", en.how.steps[2].body, "If nothing is owed, you pay $0. If we find overcharges, pay 15% of what you're owed ($0.50 minimum) upfront to unlock your full breakdown and dispute letter."],
      ["pricing.paidBody", en.pricing.paidBody, "Only if our audit finds money you're owed: pay 15% of that amount upfront ($0.50 minimum) to unlock the line-by-line calculation, citations, and dispute letter."],
      ["faq.items[1].a", en.faq.items[1].a, "Then you pay $0. If we find less than $0.50, your report unlocks free. You only pay the 15% upfront fee when our audit finds at least $0.50 you're owed."],
      ["faq.items[2].a", en.faq.items[2].a, "15% of the amount we find you're owed, with a $0.50 minimum, paid upfront to unlock the full breakdown and dispute letter. If we find $640, you pay $96. If we find $2, you pay the $0.50 minimum."],
      ["blog.ctaBody", en.blog.ctaBody, "Upload your ledger and lease. The scan is free; you pay 15% ($0.50 minimum) only if you're owed money."],
      ["upload.errorSize", en.upload.errorSize, "Your files add up to more than 15 MB. Try smaller photos or a shorter PDF."],
      ["upload.errorRate", en.upload.errorRate, "Too many uploads in a short time. Wait a minute and try again."],
      ["upload.errorDaily", en.upload.errorDaily, "You've reached today's limit for new scans. Try again tomorrow."],
      ["signup.rateLimited", en.signup.rateLimited, "Too many sign-in attempts. Wait a minute and try again."],
      ["result.checkoutRate", en.result.checkoutRate, "Too many checkout attempts. Wait a minute and try again."],
      ["result.reviewTitle", en.result.reviewTitle, "Payment under review"],
      ["signup.password.locked", en.signup.password.locked, "Too many wrong passwords. Password sign-in is paused for this email for 15 minutes. You can still sign in with an email link or reset your password."],
      ["signup.password.confirmBody", en.signup.password.confirmBody, "This reset link is for {email}. Continue only if that's your account."],
      ["signup.password.confirmCancelled", en.signup.password.confirmCancelled, "No changes were made, and your password is the same. If you didn't ask for a reset, you can ignore that email."],
      ["result.reviewBody", en.result.reviewBody, "Something about this payment didn't match your audit, so a person is reviewing it. You won't be charged again."],
      ["result.refundPendingTitle", en.result.refundPendingTitle, "Your refund is being processed"],
      ["result.refundPendingBody", en.result.refundPendingBody, "We're refunding this payment to your original payment method. If a try doesn't go through, we retry it. Once it's done, you can pay the correct fee to unlock your report."],
      ["terms.draftBanner", en.terms.draftBanner, "DRAFT: ATTORNEY REVIEW REQUIRED"],
      ["terms.refundsTitle", en.terms.refundsTitle, "Refunds"],
      ["terms.refundsIntro", en.terms.refundsIntro, "We refund the full amount, automatically, to your original payment method through Stripe when:"],
      ["terms.refundsItems[0]", en.terms.refundsItems[0], "the amount you paid doesn't match the fee owed for your audit,"],
      ["terms.refundsItems[1]", en.terms.refundsItems[1], "we can't unlock your audit after you pay, or"],
      ["terms.refundsItems[2]", en.terms.refundsItems[2], "you were charged more than once for the same audit."],
      ["terms.refundsUnrecognized", en.terms.refundsUnrecognized, 'If a payment comes from a checkout session we don\'t recognize, we don\'t refund it automatically. A person reviews it, and your account shows "Payment under review" until that\'s done.'],
      ["terms.refundsRetry", en.terms.refundsRetry, 'Each payment is refunded no more than once. If a refund doesn\'t go through, we retry it. While a retry is pending, your account shows "Your refund is being processed."'],
      // Round 2b
      ["dashboard.tabs.letter", en.dashboard.tabs.letter, "2. Your Dispute Letter"],
      ["dashboard.letterTitle", en.dashboard.letterTitle, "Rent Ledger Dispute & Refund Request Letter"],
      ["pricing.paidPrice", en.pricing.paidPrice, "15%"],
      ["pricing.paidNote", en.pricing.paidNote, "of amount owed, upfront ($0.50 min)"],
      ["terms.title", en.terms.title, "Terms of Service"],
      ["terms.refundsRelock", en.terms.refundsRelock, "After we refund a payment that didn't match the fee, your report locks again. You can then pay the correct fee to unlock it."],
    ];
    for (const [path, actual, want] of expected) expect(actual, path).toBe(want);

    const expectedEs: [string, string, string][] = [
      ["signup.passwordless", es.signup.passwordless, "Entra con un enlace de un solo uso que te enviamos por correo, o usa una contraseña."],
      ["signup.password.heading", es.signup.password.heading, "O usa una contraseña"],
      ["signup.password.label", es.signup.password.label, "Contraseña"],
      ["signup.password.hint", es.signup.password.hint, "Al menos {min} caracteres."],
      ["signup.password.signIn", es.signup.password.signIn, "Iniciar sesión con contraseña"],
      ["signup.password.signUp", es.signup.password.signUp, "Crear cuenta con contraseña"],
      ["signup.password.invalid", es.signup.password.invalid, "El correo y la contraseña no coinciden. Inténtalo de nuevo o restablece tu contraseña."],
      ["signup.password.unconfirmed", es.signup.password.unconfirmed, "Primero confirma tu correo. Abre el enlace que te enviamos y luego inicia sesión."],
      ["signup.password.weak", es.signup.password.weak, "Esa contraseña es muy corta. Usa al menos {min} caracteres."],
      ["signup.password.confirmSent", es.signup.password.confirmSent, "Ya casi. Revisa tu correo para confirmar tu cuenta y luego inicia sesión."],
      ["signup.password.forgot", es.signup.password.forgot, "¿Olvidaste tu contraseña?"],
      ["signup.password.sendReset", es.signup.password.sendReset, "Envíame un enlace para restablecerla"],
      ["signup.password.resetSent", es.signup.password.resetSent, "Si ese correo tiene una cuenta, te enviamos un enlace para restablecerla. Revisa tu bandeja de entrada y la carpeta de spam."],
      ["signup.password.expired", es.signup.password.expired, "Ese enlace venció o ya se usó. Pide uno nuevo."],
      ["signup.password.resetTitle", es.signup.password.resetTitle, "Crea una contraseña nueva"],
      ["signup.password.newLabel", es.signup.password.newLabel, "Contraseña nueva"],
      ["signup.password.save", es.signup.password.save, "Guardar contraseña nueva"],
      ["signup.password.updateError", es.signup.password.updateError, "No pudimos guardar tu contraseña. Pide un nuevo enlace e inténtalo de nuevo."],
      ["result.feeTitleMinimum", es.result.feeTitleMinimum, "Paga la tarifa mínima de {fee} para desbloquear"],
      ["result.feeLineMinimum", es.result.feeLineMinimum, "Pago por adelantado: {fee}. Es nuestra tarifa mínima, porque el 15% de los {total} que te deben da menos."],
      ["result.feeMinimumNote", es.result.feeMinimumNote, "Aviso: en una cantidad pequeña, la tarifa mínima puede ser gran parte de lo que te deben, o hasta todo. Desbloquea solo si el reporte te vale la pena."],
      ["result.waived", es.result.waived, "Sin cargo. Te deben menos de $0.50, así que tu reporte se desbloquea gratis."],
      ["dashboard.feeMinimum", es.dashboard.feeMinimum, "Tarifa por adelantado (mínimo de $0.50)"],
      ["dashboard.feeFree", es.dashboard.feeFree, "Tarifa por adelantado (sin cargo: te deben menos de $0.50)"],
      ["meta.description", es.meta.description, "Toma una foto o sube tu estado de cuenta de renta y tu contrato. LedgerFinesse revisa cada línea contra tu contrato y las leyes locales para inquilinos, gratis. Pagas 15% (mínimo $0.50) solo si te deben dinero."],
      ["footer.tagline", es.footer.tagline, "Escaneo OCR gratis · 15% solo cuando te deben dinero (mín. $0.50) · © 2026 LedgerFinesse"],
      ["hero.note", es.hero.note, "Escanear es 100% gratis. Solo pagas 15% por adelantado, con un mínimo de $0.50, si nuestra auditoría encuentra dinero que te deben."],
      ["how.steps[2].title", es.how.steps[2].title, "Paga 15% solo si te deben dinero"],
      ["how.steps[2].body", es.how.steps[2].body, "Si no te deben nada, pagas $0. Si encontramos cobros de más, pagas 15% de lo que te deben (mínimo $0.50) por adelantado para desbloquear el desglose completo y la carta de disputa."],
      ["pricing.paidBody", es.pricing.paidBody, "Solo si nuestra auditoría encuentra dinero que te deben: pagas 15% de esa cantidad por adelantado (mínimo $0.50) para desbloquear el cálculo línea por línea, las referencias y la carta de disputa."],
      ["faq.items[1].a", es.faq.items[1].a, "Entonces pagas $0. Si encontramos menos de $0.50, tu reporte se desbloquea gratis. Solo pagas la tarifa de 15% por adelantado cuando nuestra auditoría encuentra al menos $0.50 que te deben."],
      ["faq.items[2].a", es.faq.items[2].a, "15% de la cantidad que encontramos que te deben, con un mínimo de $0.50, pagado por adelantado para desbloquear el desglose completo y la carta de disputa. Si encontramos $640, pagas $96. Si encontramos $2, pagas el mínimo de $0.50."],
      ["blog.ctaBody", es.blog.ctaBody, "Sube tu estado de cuenta y tu contrato. El escaneo es gratis; pagas 15% (mínimo $0.50) solo si te deben dinero."],
      ["upload.errorSize", es.upload.errorSize, "Tus archivos suman más de 15 MB. Prueba con fotos más pequeñas o un PDF más corto."],
      ["upload.errorRate", es.upload.errorRate, "Demasiadas cargas en poco tiempo. Espera un minuto e inténtalo de nuevo."],
      ["upload.errorDaily", es.upload.errorDaily, "Llegaste al límite de escaneos nuevos de hoy. Inténtalo de nuevo mañana."],
      ["signup.rateLimited", es.signup.rateLimited, "Demasiados intentos de inicio de sesión. Espera un minuto e inténtalo de nuevo."],
      ["result.checkoutRate", es.result.checkoutRate, "Demasiados intentos de pago. Espera un minuto e inténtalo de nuevo."],
      ["result.reviewTitle", es.result.reviewTitle, "Pago en revisión"],
      ["signup.password.locked", es.signup.password.locked, "Demasiadas contraseñas incorrectas. El inicio de sesión con contraseña está en pausa para este correo durante 15 minutos. Aún puedes entrar con un enlace por correo o restablecer tu contraseña."],
      ["signup.password.confirmBody", es.signup.password.confirmBody, "Este enlace es para restablecer la contraseña de {email}. Continúa solo si esa es tu cuenta."],
      ["signup.password.confirmCancelled", es.signup.password.confirmCancelled, "No se hizo ningún cambio y tu contraseña sigue igual. Si no pediste restablecerla, puedes ignorar ese correo."],
      ["audits.status.unlocked", es.audits.status.unlocked, "Desbloqueado"],
      ["result.reviewBody", es.result.reviewBody, "Algo de este pago no coincidió con tu auditoría, así que una persona lo está revisando. No se te cobrará de nuevo."],
      ["result.refundPendingTitle", es.result.refundPendingTitle, "Tu reembolso está en proceso"],
      ["result.refundPendingBody", es.result.refundPendingBody, "Estamos reembolsando este pago a tu método de pago original. Si un intento no se completa, lo volvemos a intentar. Cuando termine, puedes pagar la tarifa correcta para desbloquear tu reporte."],
      ["terms.draftBanner", es.terms.draftBanner, "DRAFT: ATTORNEY REVIEW REQUIRED"],
      ["terms.refundsTitle", es.terms.refundsTitle, "Reembolsos"],
      ["terms.refundsIntro", es.terms.refundsIntro, "Te reembolsamos el monto completo, automáticamente, a tu método de pago original a través de Stripe cuando:"],
      ["terms.refundsItems[0]", es.terms.refundsItems[0], "lo que pagaste no coincide con la tarifa de tu auditoría,"],
      ["terms.refundsItems[1]", es.terms.refundsItems[1], "no podemos desbloquear tu auditoría después de que pagas, o"],
      ["terms.refundsItems[2]", es.terms.refundsItems[2], "se te cobró más de una vez por la misma auditoría."],
      ["terms.refundsUnrecognized", es.terms.refundsUnrecognized, 'Si un pago viene de una sesión de pago que no reconocemos, no lo reembolsamos automáticamente. Una persona lo revisa, y tu cuenta muestra "Pago en revisión" hasta que termine.'],
      ["terms.refundsRetry", es.terms.refundsRetry, 'Cada pago se reembolsa una sola vez como máximo. Si un reembolso no se completa, lo volvemos a intentar. Mientras haya un reintento pendiente, tu cuenta muestra "Tu reembolso está en proceso".'],
      // Round 2b
      ["dashboard.tabs.letter", es.dashboard.tabs.letter, "2. Tu carta de disputa"],
      ["dashboard.letterTitle", es.dashboard.letterTitle, "Carta de disputa del estado de cuenta y solicitud de reembolso"],
      ["pricing.paidPrice", es.pricing.paidPrice, "15%"],
      ["pricing.paidNote", es.pricing.paidNote, "de lo que te deben, por adelantado (mín. $0.50)"],
      ["terms.title", es.terms.title, "Términos del servicio"],
      ["terms.refundsRelock", es.terms.refundsRelock, "Después de reembolsar un pago que no coincidía con la tarifa, tu reporte se bloquea de nuevo. Luego puedes pagar la tarifa correcta para desbloquearlo."],
    ];
    for (const [path, actual, want] of expectedEs) expect(actual, path).toBe(want);
  });

  it("fills password.weak with the same {min} as the hint", () => {
    expect(fill(en.signup.password.weak, { min: 8 })).toBe("That password is too short. Use at least 8 characters.");
    expect(fill(es.signup.password.weak, { min: 8 })).toBe("Esa contraseña es muy corta. Usa al menos 8 caracteres.");
  });
});
