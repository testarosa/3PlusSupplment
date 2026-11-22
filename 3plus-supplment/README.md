# React + Vite

## HTTPS billing gateway

The frontend uses the same-origin `/portal-api` gateway on `https://e3pl.com`. Publish `server/PortalGateway/PortalGateway.csproj` with the .NET 10 SDK and deploy it as an IIS sub-application under `3Plus_Web` in its own application pool. The gateway uses the existing billing login, issues a secure session cookie, and forwards only the listed billing routes to the same-machine legacy API. `Portal:Origin`, `Portal:Backend`, and `Portal:BackendHost` configure the gateway. Keep the legacy HTTP listener unchanged when publishing static frontend files.

## 3Plus AI Credit/Debit Note import

Use an Azure OpenAI model deployment that supports vision, PDF input, and structured outputs through the Responses API. Configure `AZURE_OPENAI_ENDPOINT` (the HTTPS resource URL), `AZURE_OPENAI_DEPLOYMENT` (the deployment name), and `AZURE_OPENAI_API_KEY` in server environment variables or in the gitignored `.env.local` file for development. Keep the API key server-side and outside the `VITE_` namespace. See the [Azure Responses API guide](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses).

Start development with `npm run dev -- --host localhost`. In Create CRDR, start with **3Plus AI** to extract a PDF, PNG, or JPEG note and search its shipment reference automatically, or skip to **Shipment Lookup**. Extraction fills an empty form even when the shipment isn't found. Review the charges, **Populate from Template**, or use **Manual Entry**. Confirm the shipment and bill, agent, and dates before clicking **Create CR/DR Invoice**. The existing save endpoint continues to assign the CRDR number.

CR/DR Shipment Lookup supports ocean import references. With the matching DocProcessApi and portal gateway releases installed, build with `VITE_CRDR_AIR_IMPORT_ENABLED=true` to enable lookup by air import reference or airway bill. If an extracted note has a house AWB but no reference, it can try the AWB directly. Air memos use the selected house or master record and the shipment's branch for CR/DR numbering.

In production, the IIS gateway accepts authenticated uploads at `POST /portal-api/crdr-ai/extract`. Supply `AzureExtraction:Endpoint`, `AzureExtraction:Deployment`, and `AzureExtraction:ApiKey` as server configuration. The IIS deployment reads them from `%ProgramData%\3PlusPortalGateway\azure.json`, outside the web root with access restricted to administrators, SYSTEM, and the gateway application pool. Build the frontend with `VITE_CRDR_AI_ENABLED=true` after the gateway is ready. Use `https://e3pl.com`; the old HTTP address does not accept uploads.

AP Invoices uses the same Azure settings and frontend flag with its own authenticated upload route, `POST /portal-api/ap-invoice-ai/extract`. Start with 3Plus AI to extract invoice details and look up the extracted shipment reference automatically, or skip to manual shipment lookup. Select the bill of lading if it is not filled in, then review or enter charges in Manual Entry. Select a PLUS vendor and AP billing codes before creating the invoice.

The AP extractor accepts a single vendor invoice packaged with customs paperwork, including CBP 7501, 3461, and cargo-release pages. The review identifies the invoice pages and checks the extracted charge sum against a printed total or balance when available. Enter any missing billing codes manually. Air-import references use PlusWebApi's `GET /api/air-import/shipment-by-reference` to list available waybills. Applying an extraction uses the shipment selected in the form.

The AP Invoice List also shows billing records. Run the updated PlusWebApi on the same host, bound to `http://127.0.0.1:5164` with its PLUS connection string configured. The portal gateway forwards authenticated billing record requests to that origin; set `Portal:AccountsPayableBackend` if you use a different loopback port. Vite on localhost forwards read requests only. Keep PlusWebApi's listener private.

To enable live AP creation and edits, configure the same randomly generated shared secret as `Portal:AccountsPayableWriteKey` on the HTTPS gateway and `AccountsPayable:PortalWriteKey` on PlusWebApi. Store both outside source control. The gateway passes the signed-in employee ID for the PLUS audit fields, and PlusWebApi saves the header and charges in one transaction. Creation records the vendor invoice and charges but does not create journal entries or payments. Paid, posted, blocked, and stale records are rejected by the edit route.

On Invoices, AP billing records, and Credit / Debit Notes, the Created by filter starts with the signed-in PLUS user ID. Type a name or ID to look up users in T_USER, or clear the field and search for all users. Deploy the frontend, gateway, and updated PlusWebApi together for this filter.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
