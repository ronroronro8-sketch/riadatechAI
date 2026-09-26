# RiadaTech - Open Data Lab Competition Edition

RiadaTech is an intelligent location recommendation platform for SMEs and entrepreneurs in Oman. This competition edition is prepared for the Open Data Lab requirements by documenting and using official datasets from the National Open Data Portal: https://opendata.gov.om

## What was updated

- Added a new Data Sources page at `/data-sources`.
- Added the Data Sources link to the existing navigation without changing the original website structure.
- Updated the location recommendation wording to focus on official open-data indicators.
- Updated the backend location scoring model so the main recommendation score depends on open-data indicators instead of treating external map data as the core source.
- Kept MongoDB, login, register, and existing routes untouched.

## Official datasets used or documented

1. Startups Data in the Sultanate of Oman  
   https://opendata.gov.om/en/datasets/fbf7fa41-9ced-45d9-b705-4908b5f60756

2. Statistics of companies registered in the Oman Chamber of Commerce and Industry and operating by governorate  
   https://opendata.gov.om/en/datasets/59e47452-693f-4f5c-adcc-c6fc6910c7c9

3. Tourism Activities Establishments Data in the Sultanate of Oman  
   https://opendata.gov.om/en/datasets/d9e8fb32-8e88-4bcb-9dce-df263d97a090

4. Craft Enterprises Data in the Sultanate of Oman  
   https://opendata.gov.om/en/datasets/e81d5e3a-843e-4040-9b88-41a540a3dd6f

5. List of the names of the governorates in the Sultanate of Oman and the wilayats  
   https://opendata.gov.om/en/datasets/9d822347-6816-4166-96d9-8ead92974fa0

## Local run

### Backend

```bash
cd postITapp/server
npm install
npm start
```

The backend uses port `3003` by default. Check `postITapp/server/.env` for `MONGO_URI` and API keys.

### Frontend

```bash
cd postITapp/client
npm install
npm start
```

The frontend uses port `3000` by default.

## Important notes

- External map or POI data may be used only as a supporting visual layer. The competition story and the Data Sources page focus on official open data from `opendata.gov.om`.
- The Data Sources page should be submitted as evidence that the use case clearly mentions the datasets and how they are used.
