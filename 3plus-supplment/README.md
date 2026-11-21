# React + Vite

## HTTPS billing gateway

The frontend uses the same-origin `/portal-api` gateway on `https://e3pl.com`. Publish `server/PortalGateway/PortalGateway.csproj` with the .NET 10 SDK and deploy it as an IIS sub-application under `3Plus_Web` in its own application pool. The gateway uses the existing billing login, issues a secure session cookie, and forwards only the listed billing routes to the same-machine legacy API. `Portal:Origin`, `Portal:Backend`, and `Portal:BackendHost` configure the gateway. Keep the legacy HTTP listener unchanged when publishing static frontend files.

## Azure AI Credit/Debit Note import

Use an Azure OpenAI model deployment that supports vision, PDF input, and structured outputs through the Responses API. Configure `AZURE_OPENAI_ENDPOINT` (the HTTPS resource URL), `AZURE_OPENAI_DEPLOYMENT` (the deployment name), and `AZURE_OPENAI_API_KEY` in server environment variables or in the gitignored `.env.local` file for development. Keep the API key server-side and outside the `VITE_` namespace. See the [Azure Responses API guide](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses).

Start development with `npm run dev -- --host localhost`. In Create CRDR, look up the shipment and select the BL first. Then choose a source: upload a PDF, PNG, or JPEG and click **Extract with Azure AI**, apply an agent template with **Populate Template**, or select **Enter Manually** to start with a blank charge line. Review the shipment, agent, dates, currency, and charges before clicking **Create CR/DR Invoice**. The existing save endpoint continues to assign the CRDR number.

In production, the IIS gateway accepts authenticated uploads at `POST /portal-api/crdr-ai/extract`. Supply `AzureExtraction:Endpoint`, `AzureExtraction:Deployment`, and `AzureExtraction:ApiKey` as server configuration. The IIS deployment reads them from `%ProgramData%\3PlusPortalGateway\azure.json`, outside the web root with access restricted to administrators, SYSTEM, and the gateway application pool. Build the frontend with `VITE_CRDR_AI_ENABLED=true` after the gateway is ready. File selection is enabled after shipment lookup on `https://e3pl.com`; the old HTTP address does not accept uploads.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
