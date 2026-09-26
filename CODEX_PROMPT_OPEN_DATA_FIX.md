Fix and finalize the RiadaTech React/Node project for the Open Data Lab competition without changing the existing UI style or breaking current login, register, MongoDB, map-analysis, funding, assistant, home, services, and contact links.

Current project structure:
- Frontend: postITapp/client
- Backend: postITapp/server
- Backend port: 3003
- Frontend port: 3000

Required behavior:
1. Keep the original website design, colors, navbar layout, auth flow, and routes.
2. Add a new page route: /data-sources
3. Add a navbar link named "مصادر البيانات" in Arabic and "Data Sources" in English.
4. The page must match the existing dark/cyan RiadaTech design.
5. The page must only include:
   - A hero/title section.
   - A short compliance box.
   - A table of official open data sources.
   Do NOT add the extra section titled "كيف تدخل البيانات في التحليل؟" or any long explanatory cards under the table.
6. Make all internal navigation links work with React Router.
7. Add Vercel SPA rewrite so refreshing /data-sources or /map-analysis does not show 404.
8. Do not change the existing MongoDB connection code or .env values.
9. Update the wording in the map-analysis page so the scoring explanation says it depends on official open-data indicators, not Google Places as the main source.
10. Backend location recommendation score should prioritize official open-data indicators:
   - population demand
   - startups count
   - registered business activity
   - sector-support signals
   External Google/POI data can stay only as a supporting visual layer, not the main competition source.

Official opendata.gov.om sources to include in the Data Sources table:
1. Startups Data in the Sultanate of Oman
   Publisher: SMEs Development Authority
   URL: https://opendata.gov.om/en/datasets/fbf7fa41-9ced-45d9-b705-4908b5f60756
   Use: Startup Ecosystem Score

2. Statistics of companies registered in the Oman Chamber of Commerce and Industry and operating by governorate
   Publisher: Oman Chamber of Commerce and Industry
   URL: https://opendata.gov.om/en/datasets/59e47452-693f-4f5c-adcc-c6fc6910c7c9
   Use: Business Activity Score

3. Tourism Activities Establishments Data in the Sultanate of Oman
   Publisher: SMEs Development Authority
   URL: https://opendata.gov.om/en/datasets/d9e8fb32-8e88-4bcb-9dce-df263d97a090
   Use: Sector Opportunity Signal

4. Craft Enterprises Data in the Sultanate of Oman
   Publisher: SMEs Development Authority
   URL: https://opendata.gov.om/en/datasets/e81d5e3a-843e-4040-9b88-41a540a3dd6f
   Use: Local Productive Activity Signal

5. List of the names of the governorates in the Sultanate of Oman and the wilayats
   Publisher: Ministry of Interior
   URL: https://opendata.gov.om/en/datasets/9d822347-6816-4166-96d9-8ead92974fa0
   Use: Location Reference

After changes, run:
- cd postITapp/server && npm install && node --check index.js
- cd postITapp/client && npm install && npm run build
Fix any React import, lint, route, or build errors.
