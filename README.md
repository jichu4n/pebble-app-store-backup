# Pebble App Store Backup

This repo is a collection of scripts to download watchfaces and apps data from the Pebble App Store, which is scheduled to be shutdown on June 30, 2018.

## Code

The scripts are written in TypeScript and require a Node.js runtime. To run the code:

```bash
# Clone repo
git clone https://github.com/jichu4n/pebble-app-store-backup.git
cd pebble-app-store-backup
# Install dependencies with NPM
npm install

# Scrape metadata to data/metdata
npm run scrape-metadata
# Scrape blobs (PBW files and images) to data/blobs
npm run scrape-blob
```

The scripts use the Pebble App Store APIs documented in [this gist](https://gist.github.com/fletchto99/0be62d09c7b993fdd8ec).

## Data

Data downloaded on June 19, 2018:

- **Metadata**: [data/metadata](https://github.com/jichu4n/pebble-app-store-backup/tree/master/data/metadata)
- **Metadata and blobs** (PBW files and images): [Google Drive](https://drive.google.com/open?id=1gtf7xguGPUIRRsZi8ZCwDrYe7mQI39X_)
