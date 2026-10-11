# KRA eTIMS setup

OrbitOS sends invoices to KRA through **eTIMS OSCU** (Online Sales Control Unit), KRA's API for systems that are always online. It does two separate jobs:

- **Your own receipts (platform).** When a workspace pays for an OrbitOS plan, the receipt is fiscalised on *your* (the OrbitOS operator's) eTIMS device. The customer's KRA PIN goes on the receipt if they added it under **Settings → Plan & billing**.
- **Your customers' invoices (per workspace).** A workspace can connect *its own* eTIMS device under **Settings → KRA eTIMS**. After that, every client invoice it sends from **Operations → Invoices** is fiscalised. Each invoice gets a KRA receipt number, a signature and a QR code, which also appear on the PDF. Voiding a fiscalised invoice sends a credit note.

Both are off until you set them up. Nothing in OrbitOS waits on KRA. If KRA is slow or down, the document is queued, and the hourly job (`/api/cron/etims`) retries it. Invoice numbers stay consecutive, as KRA requires.

> **Tested against a simulator only.** The full flow (device initialisation, item registration, sales, credit notes, rejections, retries) is covered by `npm run test:e2e:integrations` against `scripts/local-stack/etims-mock.mjs`. It has not yet been run against KRA's real sandbox. Do that before relying on it (step 3).

## 1. Become an eTIMS integrator (once, for OrbitOS itself)

KRA only accepts OSCU traffic from systems it has vetted. You can integrate yourself ("self-integration") or work through a KRA-verified third-party integrator. See [KRA: eTIMS system-to-system integration](https://www.kra.go.ke/business/etims-electronic-tax-invoice-management-system/learn-about-etims/etims-system-to-system-integration).

1. Sign up for the **sandbox** (`etims-sbx.kra.go.ke`) using KRA's [OSCU/VSCU sign-up guide](https://www.kra.go.ke/images/publications/OSCU_VSCU_Step-by-Step_Guide-on-how-to-sign-up.pdf).
2. KRA sends test details: a **PIN**, a **branch ID** (usually `00`) and a **device serial number**.
3. Complete KRA's testing and certification. After approval, you get production device details for your own PIN.

## 2. Server settings (Vercel → Settings → Environment Variables)

| Variable | What it is |
|---|---|
| `ENCRYPTION_KEY` | **Required for eTIMS and calendar sync.** 32 random bytes as 64 hex characters. It encrypts KRA communication keys (and calendar tokens) before they are stored. Generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it safe: if it changes, every workspace has to reconnect. |
| `ETIMS_ENV` | `sandbox` (default) or `production` |
| `ETIMS_TIN` | Your KRA PIN, e.g. `P051234567X` (platform receipts) |
| `ETIMS_BHF_ID` | Branch ID from KRA, usually `00` |
| `ETIMS_DEVICE_SERIAL` | Device serial number from KRA's approval |
| `ETIMS_ITEM_CLS_CD` | KRA item classification code for "software subscription". Look one up in Settings → KRA eTIMS → **Search KRA classifications**, or in KRA's code list. |
| `ETIMS_TAX_TYPE` | Optional. `B` = 16% VAT (default), `A` = exempt, `C` = zero-rated, `D` = non-VAT, `E` = 8% |
| `ETIMS_ITEM_NAME` | Optional. Name on receipts (default "OrbitOS subscription") |

The platform device turns on when `ETIMS_TIN`, `ETIMS_DEVICE_SERIAL` and `ETIMS_ITEM_CLS_CD` are all set. Redeploy after changing them.

## 3. Prove it on KRA's sandbox

1. Set `ETIMS_ENV=sandbox` and the sandbox details from step 1, then redeploy.
2. As a workspace owner, open **Settings → KRA eTIMS**. Enter the sandbox PIN, branch and device serial, then click **Connect to KRA**. OrbitOS calls KRA's `selectInitOsdcInfo` and stores the communication key, encrypted.
3. Use **Search KRA classifications** to pick a code, then register your service item.
4. Create an invoice for a test client and send it. On the invoice page, the eTIMS panel should show **Accepted by KRA** with a receipt number and QR code.
5. Void that invoice. A credit note should be accepted.
6. Pay for a plan with the IntaSend sandbox. The receipt PDF under **Settings → Plan & billing** should carry an eTIMS receipt number.

When all of that works, switch to `ETIMS_ENV=production` with your production device details.

## 4. What each workspace does

Owners connect under **Settings → KRA eTIMS** with *their* PIN and device details from KRA. Directors and auditors can see the status and every submitted document, but cannot change the connection. Client KRA PINs are optional on invoices. Add one when the client wants to claim input VAT.

## Troubleshooting

- **"KRA says this device is already initialised" (902).** KRA hands out a device's key only once. Enter exactly the details it was first set up with, or ask KRA to reset the device.
- **An invoice shows "Waiting for KRA".** KRA didn't answer. The hourly job retries with backoff, and **Send to KRA now** on the invoice retries immediately.
- **An invoice shows "Rejected by KRA".** The panel shows KRA's code and message, e.g. an unregistered client PIN. Fix the cause, then send again. The rejected number is released so the sequence has no gaps.
- **"ENCRYPTION_KEY is not set".** Add the variable (step 2) and redeploy.
