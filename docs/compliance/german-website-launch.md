# German website launch evidence (Sprint 52 / VER-265)

This is a technical inventory and release gate, not an approved legal notice. The operator must verify the production configuration and approve the final Impressum and Datenschutzerklärung before public launch.

## Browser storage and third parties found in the gateway code

| Item | Where | Purpose | Current behavior |
| --- | --- | --- | --- |
| `ca_session` | `apps/gateway-web/lib/session.ts` | Signed-in session | HttpOnly, SameSite=Lax, path `/`, Secure in production by default, expiry aligned to login response or 24-hour fallback. Created after login. |
| `ca_mfa_challenge` | `apps/gateway-web/lib/session.ts` | MFA step-up/enrolment challenge | HttpOnly, SameSite=Lax, path `/`, Secure in production by default, five-minute expiry. Created for the requested authentication flow. |
| `ca_cookie_notice_v1` | `apps/gateway-web/app/components/CookieSettings.tsx` | Remember that the visitor closed the informational cookie notice | Local storage after the visitor clicks “Verstanden”; no analytics or advertising consent is implied. |

The gateway code scan on 2026-10-11 found no Google Analytics, Matomo, Plausible, advertising scripts, external fonts, video embeds, or other optional client-side storage. Its CSP currently restricts scripts, fonts and connections to the site origin. The cookie notice therefore states that there are no optional analytics or advertising cookies and does not show a misleading accept-all action. If a later feature adds optional storage, external media, or tracking, it must remain disabled until a purpose-specific prior consent flow is implemented and this inventory is updated.

## Production facts still required

- Legal operator identity, postal address, email, legal form, representative, register and VAT details where applicable; any editorial responsibility details required by the actual service model.
- Controller and data-protection contact; whether a DPO is required.
- German host and datacenter location, processor agreement, subcontractors, CDN/proxy, DNS, email provider, and any third-country transfers.
- Production access/application logs, IP handling, retention and deletion periods; account, upload, search, audit and backup retention; rights-request process.
- Deployment traffic capture for a fresh anonymous browser, signed-in browser, rejected/closed notice, and all optional features. Compare cookies, local storage and outgoing requests with this table.
- Accessibility and other publication duties that apply to the actual operator and audience.

## Release gate

1. Operator supplies the facts above and an authorized legal reviewer approves the text for both legal pages. Admin publishes the reviewed revisions through the legal-page editor; the fictional editor examples are never published automatically.
2. Public `/impressum` and `/datenschutz` show those revisions to anonymous visitors. Footer and cookie links work without sign-in. `/impressum` emits `noindex` while remaining crawlable and is absent from the XML sitemap.
3. Browser and network checks confirm there are no optional requests or storage before valid consent. If no optional use exists, confirm that the notice describes only necessary uses and its own dismissal preference.
4. Review production hosting, processor, logging, transfer and retention evidence against the published privacy notice. Any discrepancy blocks legal-readiness sign-off.

Primary references: [DDG §5](https://www.gesetze-im-internet.de/ddg/__5.html), [TDDDG §25](https://www.gesetze-im-internet.de/ttdsg/__25.html), [GDPR Articles 7, 12 and 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj), [DSK digital services guidance](https://www.datenschutzkonferenz-online.de/media/oh/OH_Digitale_Dienste.pdf).
