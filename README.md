# Pebble App Store Backup

This repo is a collection of scripts to download watchfaces and apps data from the Pebble App Store, which is scheduled to be shutdown on June 30, 2018.

## Code

The scripts require a [Node.js](https://nodejs.org/en/) runtime. To run the code:

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

The `npm run scrape-blob` script takes several hours to complete depending on your connection speed, and may fail for random listings due to transient network issues.

To resume or retry failed listings, just re-run the script.
Since it tracks progress internally (via `data/blobs/*/index.json` files), re-running will just skip over already downloaded files.

## Data format

### [`data/metadata`](https://github.com/jichu4n/pebble-app-store-backup/tree/master/data/metadata)

The `npm run scrape-metadata` script fetches the following data (via [Pebble App Store APIs](https://gist.github.com/fletchto99/0be62d09c7b993fdd8ec)):

- [`data/metadata/watchfaces`](https://github.com/jichu4n/pebble-app-store-backup/tree/master/data/metadata/watchfaces): original JSON responses from `https://api2.getpebble.com/v2/apps/collection/all/watchfaces`
- [`data/metadata/apps`](https://github.com/jichu4n/pebble-app-store-backup/tree/master/data/metadata/apps): original JSON responses from `https://api2.getpebble.com/v2/apps/collection/all/watchapps-and-companions`

### [`data/blobs`](https://github.com/jichu4n/pebble-app-store-backup/tree/master/data/blobs)

The `npm run scrape-blob` script reads the metadata scraped from the previous step and downloads the blobs (PBW files and images) associated with each App Store listing into the [`data/blobs`](https://github.com/jichu4n/pebble-app-store-backup/tree/master/data/blobs) directory. Each subdirectory beneath corresponds to an App Store listing.

Each subdirectory contains an `index.json` file (see [example](https://github.com/jichu4n/pebble-app-store-backup/blob/master/data/blobs/528fc371a92e1fb023000015/index.json)), which contains more metadata about the blobs associated with a Pebble App Store listing. Example:

```json
[
    {
        "listingId": "528fc371a92e1fb023000015",
        "type": "pbw",
        "url":" https://www.filepicker.io/api/file/X74XWKVuTQyAUuWdN3yQ",
        "etag": "844b280c3fda073f3fe0fc424827d671",
        "contentType": "application/octet-stream",
        "origFileName": "7-Min_Workout 2.2.pbw",
        "fileName": "0cff30a943783722e88251f71ea559823e7629f7",
        "sha1": "49462e4c9a0a8fdb30a2ff95e023e5d7da98c45f"
    },
    {
        "listingId": "528fc371a92e1fb023000015",
        "type": "screenshot_images-144x168",
        "url": "https://assets.getpebble.com/api/file/rgE2pOCTyizuEvzlmtd1/convert?cache=true&fit=crop&w=144&h=168",
        "etag": "65ef65dc03355cde3bd6424b1d214ebf",
        "contentType": "image/png",
        "origFileName": "pebble-time-ss2.png",
        "fileName": "1e4feb1c5338a777de3a941ceabdefa043715486",
        "sha1": "c742896d2ded65c4fc87986f301175fdd9a7ca20"
    },
    ...
]
```

Note regarding the fields:

- `fileName`: The file name on disk of the downloaded blob in the same directory as the `index.json` file.
- `origFileName`: The proposed file name in the `Content-Disposition` header. This is not used to create the actual files as it may contain invalid file name characters and may not be unique.
- `sha1`: SHA1 checksum of the file contents.

## Data

Data downloaded on June 30, 2018:

- **Metadata**: [`data/metadata`](https://github.com/jichu4n/pebble-app-store-backup/tree/master/data/metadata)
- **Metadata and blobs** (PBW files and images): [Google Drive](https://drive.google.com/open?id=1gtf7xguGPUIRRsZi8ZCwDrYe7mQI39X_)
