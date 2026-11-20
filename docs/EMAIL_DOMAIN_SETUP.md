# Sending LearnSpace Emails from Your Own Domain (Deliverability & Spam Prevention)

Consumer/free email relays (like EmailJS on a personal Gmail or unverified `.local` senders) frequently land in Spam or Promotions because they lack domain-aligned **SPF**, **DKIM**, and **DMARC** signatures.

---

## 1. Choose & Verify Your Domain

1. Buy or use a domain you own (e.g., `learnspace.app` or `yourdomain.com` from Namecheap, Cloudflare Registrar, or Porkbun).
2. Create an account on **Resend** (`resend.com`, 3,000 emails/month free) or **Brevo** (`brevo.com`, 300 emails/day free).
3. In the provider dashboard, go to **Domains → Add Domain** and enter your domain (or a dedicated subdomain like `mail.yourdomain.com`).

---

## 2. Add DNS Records (SPF, DKIM, DMARC)

Open your DNS provider (Cloudflare, Namecheap, etc.) and add the exact records shown in Resend/Brevo:

| Purpose                                                     | DNS Type                                               | Host / Name                                                              | Value / Target                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **DKIM** _(proves email wasn't tampered with)_              | `TXT` (or `CNAME` for Brevo/Resend)                    | Provided by Resend/Brevo (e.g. `resend._domainkey` or `mail._domainkey`) | Exact public key string or CNAME target copied from the Resend/Brevo Domain page                                                     |
| **SPF** _(authorizes provider IPs to send for your domain)_ | `TXT` (or `MX` + `TXT` on `send` subdomain for Resend) | `@` (or `send` if Resend uses a return-path subdomain)                   | Resend: `v=spf1 include:amazonses.com ~all` (or the exact `TXT` value shown in Resend)<br>Brevo: `v=spf1 include:spf.brevo.com ~all` |
| **DMARC** _(tells Gmail/Outlook how to handle spoofing)_    | `TXT`                                                  | `_dmarc`                                                                 | Start at `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`                                                                         |

> **Important:** Wait for DNS propagation (usually 5–15 minutes), then click **Verify DNS Records** in Resend/Brevo until **SPF** and **DKIM** both show green **Verified**.

---

## 3. Tighten DMARC Gradually

1. **Week 1 (`p=none`):** `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` — monitors reports without blocking legitimate mail.
2. **Week 2 (`p=quarantine`):** `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@yourdomain.com` — sends unauthenticated spoofs to spam.
3. **Production (`p=reject`):** `v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com` — strongest inbox trust & anti-spoofing protection.

---

## 4. Configure Railway (`learnspace-api`) Variables

Set these in Railway → `learnspace-api` → **Variables**:

- **If using Resend:**
  - `EMAIL_PROVIDER=resend`
  - `RESEND_API_KEY=re_...`
  - `EMAIL_FROM=LearnSpace <no-reply@yourdomain.com>`
  - `EMAIL_REPLY_TO=support@yourdomain.com`
- **If using Brevo:**
  - `EMAIL_PROVIDER=brevo`
  - `BREVO_API_KEY=xkeysib-...`
  - `EMAIL_FROM=LearnSpace <no-reply@yourdomain.com>`
  - `EMAIL_REPLY_TO=support@yourdomain.com`

---

## 5. Test Deliverability & Check Gmail Headers

1. **Mail-Tester:** Send a test verification email to the temporary address on `https://www.mail-tester.com` and aim for **9/10 or 10/10**.
2. **Gmail "Show original":**
   - Open a LearnSpace verification email in Gmail.
   - Click the three dots (`⋮`) next to the timestamp → **Show original**.
   - Confirm all three lines show **PASS**:
     - `SPF: PASS with IP ...`
     - `DKIM: 'PASS' with domain yourdomain.com`
     - `DMARC: 'PASS'`
