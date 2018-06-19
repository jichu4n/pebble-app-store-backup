import * as contentDisposition from 'content-disposition';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as _ from 'lodash';
import * as minimist from 'minimist';
import * as path from 'path';
import * as request from 'request-promise-native';
import * as uuidv4 from 'uuid/v4';
import logger from './logger';
import {MetadataFileReader, MetadataFileReaderOptions} from './metadata';

export const DEFAULT_OUTPUT_DIR_PATH = path.normalize(
  path.join(__dirname, '..', 'data', 'blobs')
);
export const BLOB_INDEX_FILE_NAME = 'index.json';

interface BlobSource {
  type: string;
  url: string;
}

export interface BlobIndexRecord {
  listingId: string;
  type: string;
  url: string;
  etag: string;
  contentType: string;
  origFileName: string;
  fileName: string;
  sha1: string;
}

export interface BlobScraperOptions extends MetadataFileReaderOptions {
  outputDirPath: string;
  maxNumFiles?: number;
}

export class BlobScraper {
  constructor(options: BlobScraperOptions) {
    this.options = options;
    this.metadataFileReader = new MetadataFileReader(options);
  }

  async scrapeBlobs() {
    let listings = await this.metadataFileReader.getAllListings();
    if (this.options.maxNumFiles) {
      listings = listings.slice(0, this.options.maxNumFiles);
    }
    for (let i = 0; i < listings.length; ++i) {
      let listing = listings[i];
      logger.info(`[${i}] Processing ${listing.id}`);
      let records = await this.getBlobIndexRecords(listing.id);
      let blobSources: BlobSource[] = _.filter(
        [
          {
            type: 'pbw',
            url: _.get(listing, ['latest_release', 'pbw_file'], ''),
          },
          ..._
            .flatten((listing.screenshot_images || []).map(Object.entries))
            .map(([size, url]) => ({
              type: `screenshot_images-${size}`,
              url,
            })),
          ..._
            .flatten((listing.header_images || []).map(Object.entries))
            .map(([size, url]) => ({
              type: `header_images-${size}`,
              url,
            })),
          ...Object.entries(listing.list_image || {}).map(([size, url]) => ({
            type: `list_image-${size}`,
            url,
          })),
          ...Object.entries(listing.icon_image || {}).map(([size, url]) => ({
            type: `icon_image-${size}`,
            url,
          })),
        ],
        'url'
      );
      let newRecords = _.filter(
        await Promise.all(
          blobSources.map(async (blobSource) => {
            let record = _.find(
              records,
              (record: BlobIndexRecord) =>
                record.type == blobSource.type && record.url == blobSource.url
            );
            if (!record) {
              logger.info(`[${i}] No existing record for ${blobSource.type}`);
            } else if (!(await this.isOutputFileValid(listing.id, record))) {
              logger.info(`[${i}] No valid output file for ${blobSource.type}`);
            } else {
              logger.info(`[${i}] Skipping ${blobSource.type}`);
              return record;
            }
            return await this.scrapeBlob(i, listing.id, blobSource);
          })
        )
      );
      await this.writeBlobIndexRecords(listing.id, newRecords);
    }
  }

  private async scrapeBlob(
    i: number,
    listingId: string,
    blobSource: BlobSource
  ): Promise<BlobIndexRecord> {
    if (!blobSource.url) {
      logger.info(`[${i}] Missing URL for ${blobSource.type}, skipping`);
      return null;
    }
    let record: BlobIndexRecord = {
      listingId,
      type: blobSource.type,
      url: blobSource.url,
      etag: '',
      contentType: '',
      origFileName: '',
      fileName: '',
      sha1: '',
    };
    try {
      logger.info(`[${i}] Fetching ${blobSource.type} from ${blobSource.url}`);
      let response: request.FullResponse = await request.get(blobSource.url, {
        resolveWithFullResponse: true,
      });
      record.origFileName = response.headers['content-disposition']
        ? contentDisposition.parse(response.headers['content-disposition'])
            .parameters['filename']
        : '';
      record.fileName = uuidv4();
      record.etag = _.trim((response.headers['etag'] || '') as string, '"');
      record.contentType = response.headers['content-type'] || '';
      record.sha1 = this.getSha1Hash(response.body);
      logger.info(`[${i}] ${blobSource.type} --> ${record.fileName}`);
      await fs.outputFile(
        this.getOutputFilePath(listingId, record),
        response.body
      );
    } catch (e) {
      logger.error(
        `[${i}] Failed to scrape ${blobSource.type} ` +
          `from ${blobSource.url}: ${e}`
      );
    }
    return record;
  }

  private writeBlobIndexRecords(
    listingId: string,
    records: BlobIndexRecord[]
  ): Promise<void> {
    return fs.outputJson(this.getBlobIndexFilePath(listingId), records);
  }

  private async getBlobIndexRecords(
    listingId: string
  ): Promise<BlobIndexRecord[]> {
    let blobIndexFilePath = this.getBlobIndexFilePath(listingId);
    logger.info(`Loading blob index from ${blobIndexFilePath}`);
    if (!(await fs.pathExists(blobIndexFilePath))) {
      return [];
    }
    return _.filter(await fs.readJson(blobIndexFilePath));
  }

  private async isOutputFileValid(
    listingId: string,
    record: BlobIndexRecord
  ): Promise<boolean> {
    if (!record.fileName || !record.sha1) {
      return false;
    }
    let outputFilePath = this.getOutputFilePath(listingId, record);
    if (!(await fs.pathExists(outputFilePath))) {
      return false;
    }
    let content = await fs.readFile(outputFilePath);
    return this.getSha1Hash(content) == record.sha1;
  }

  private getBlobIndexFilePath(listingId: string) {
    return path.join(
      this.options.outputDirPath,
      listingId,
      BLOB_INDEX_FILE_NAME
    );
  }

  private getOutputFilePath(listingId: string, record: BlobIndexRecord) {
    return path.join(this.options.outputDirPath, listingId, record.fileName);
  }

  private getSha1Hash(content: string | Buffer) {
    return crypto
      .createHash('sha1')
      .update(content)
      .digest('hex');
  }

  private options: BlobScraperOptions;
  private metadataFileReader: MetadataFileReader;
}

if (require.main === module) {
  let args = minimist(process.argv.slice(2), {
    string: ['outputDirPath'],
    default: {
      outputDirPath: DEFAULT_OUTPUT_DIR_PATH,
      maxNumFiles: null,
    },
  });
  let blobScraper = new BlobScraper({
    outputDirPath: args.outputDirPath,
    maxNumFiles: args.maxNumFiles,
  });
  blobScraper.scrapeBlobs();
}
