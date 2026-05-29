# Airtable Leads Sync Setup

Use this when you want the Admin button to pull live Leads data from Airtable.

## Airtable values

- Base ID: `apptyU2BYHf4YsIol`
- Table: `Leads`
- Table ID: `tblKmMJaP7SPnZMwg`

## Click-by-click

1. Go to `https://airtable.com/create/tokens`.
2. Click `Create token`.
3. Name it `Marketing Dashboard Sync`.
4. Click `+ Add a scope`.
5. Choose `data.records:read`.
6. Under resources, click `+ Add a base`.
7. Choose the base that contains the `Leads` table.
8. Click `Create token`.
9. Copy the token that starts with `pat`.

## Host the sync endpoint

Deploy this folder to Vercel or another host that supports serverless functions.

Add these environment variables in the host dashboard:

```text
AIRTABLE_TOKEN=your_pat_token_here
AIRTABLE_BASE_ID=apptyU2BYHf4YsIol
AIRTABLE_LEADS_TABLE=Leads
```

The sync endpoint path is:

```text
/api/airtable-sync
```

After deployment, copy the full URL, for example:

```text
https://your-project.vercel.app/api/airtable-sync
```

## In the dashboard

1. Open Admin.
2. Go to `Airtable Sync`.
3. Paste the endpoint URL into `Sync endpoint`.
4. Confirm Base ID is `apptyU2BYHf4YsIol`.
5. Confirm Lead table is `Leads`.
6. Click `Save sync settings`.
7. Click `Sync overview & leads`.
